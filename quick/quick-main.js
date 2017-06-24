'use strict'

/* global hljs */

const version = require('./gen/version')

const i18n = require('../lib/hc-i18n')
i18n.loadStrings(require('./gen/strings'))
const __ = i18n.getText

const toYaml = require('./scaffold-json-to-yaml').toYaml
const YAML = require('yaml-js')

const handlebars = require('handlebars/runtime')
require('./gen/templates')

const SAVE_JSON_KEY = 'hc-scaffold-save-json'

/**
 * Generates a holochain dna scaffold file.
 */
class QuickStart {
  /**
   * Set up some default class vars
   */
  constructor () {
    this.nextTemplateId = Math.random()
    this.templates = {}
    this.uuid = this._genUuid()

    this.ROOT = document.querySelector('#hc-scaffold')

    handlebars.registerHelper('__', function tr (/* args */) {
      return __.apply(this, arguments)
    })
  }

  /**
   * If wehave a `lang` query string, just render with that language.
   * Otherwise, start off with a list of language buttons.
   */
  run () {
    const match = location.search.match(/lang=([^&]+)/)
    let lang
    if (match && match[1]) {
      lang = decodeURIComponent(match[1]).trim()
    }

    if (i18n.listLocales().indexOf(lang) > -1) {
      i18n.setLocale(lang)

      this._genTemplates(this.ROOT, 'page', {})
      this.page = this.ROOT.querySelector('.page')
      this.yamlDisplay = this.ROOT.querySelector('.yaml-display')
      this.appName = this.ROOT.querySelector('#appname')
      this.appDesc = this.ROOT.querySelector('#appdesc')
      this.zomesDiv = this.ROOT.querySelector('#zomes')

      let json
      try {
        json = JSON.parse(localStorage.getItem(SAVE_JSON_KEY))
      } catch (e) { /* pass */ }

      // If we have json saved, render the ui based off of that
      if (json) {
        this._loadJson(json)
      } else {
        // otherwise show an empty ui
        this._displayYaml()
      }
    } else {
      for (let locale of i18n.listLocales()) {
        i18n.setLocale(locale)
        this._genTemplates(this.ROOT, 'lang-button', {
          locale: locale,
          langName: __('langName')
        })
      }
    }
  }

  // -- access from template binding -- //

  /**
   * On language button click, re-render using that language
   */
  $selectLocale (params, evtData) {
    evtData.evt.stopPropagation()

    location.search = 'lang=' + encodeURIComponent(params.locale)
  }

  /**
   * Since we save the state in localstorage... we need a way
   * to start over.
   */
  $newDocument (params, evtData) {
    localStorage.removeItem(SAVE_JSON_KEY)
    location.reload()
  }

  /**
   * Allow users to upload json or yaml dna files.
   * Re-render based off their upload if it parses.
   */
  $upload (params, evtData) {
    const i = document.createElement('input')
    i.type = 'file'
    i.style.display = 'none'
    const listener = (evt) => {
      i.removeEventListener('change', listener, false)
      this.ROOT.removeChild(i)

      const reader = new FileReader()
      reader.onerror = () => {
        throw new Error('Error Reading File: ' + i.files[0].name)
      }
      reader.onload = () => {
        let json
        try {
          json = JSON.parse(reader.result)
        } catch (e) { /* pass */ }
        try {
          json = YAML.load(reader.result)
        } catch (e) { /* pass */ }
        if (!json) {
          throw new Error('Error Parsing File: ' + i.files[0].name)
        }
        localStorage.setItem(SAVE_JSON_KEY, JSON.stringify(json))
        location.reload()
      }
      reader.readAsText(i.files[0])
    }
    i.addEventListener('change', listener, false)
    this.ROOT.appendChild(i)
    i.click()
  }

  /**
   * They clicked the 'hamburger' - display the pop-up menu
   */
  $menu (params, evtData) {
    this._genTemplates(this.ROOT, 'menu', {})
  }

  /**
   * They clicked outside the pop-up menu, dismiss it
   */
  $dismiss (params, evtData) {
    this._rmTemplate(params.id)
  }

  /**
   * Re-render the popup menu with languages
   * TODO - if we get more than screen size here... i think it won't
   * scroll correctly...
   */
  $languageMenu (params, evtData) {
    evtData.evt.stopPropagation()

    const cont = this.templates[params.id].parent
      .querySelector('.menu-container')
    while (cont.childNodes.length) {
      cont.removeChild(cont.childNodes[0])
    }
    for (let locale of i18n.listLocales()) {
      i18n.setLocale(locale)
      this._genTemplates(cont, 'lang-button', {
        locale: locale,
        langName: __('langName')
      })
    }
  }

  /**
   * show the "about" menu
   */
  $about (params, evtData) {
    evtData.evt.stopPropagation()

    const cont = this.templates[params.id].parent
      .querySelector('.menu-container')
    while (cont.childNodes.length) {
      cont.removeChild(cont.childNodes[0])
    }
    this._genTemplates(cont, 'about', {
      version: version.version,
      url: version.url
    })
  }

  /**
   * Squish / Unsquish the sidebar
   */
  $toggleYaml (params, evtData) {
    if (this.page.classList.contains('sidebar-hidden')) {
      this.page.classList.remove('sidebar-hidden')
    } else {
      this.page.classList.add('sidebar-hidden')
    }
  }

  /**
   * Trigger download of the dna yaml
   */
  $downloadYaml (params, evtData) {
    let data = this._genYaml()
    data = new Blob([data], {type: 'application/yaml'})
    data = URL.createObjectURL(data)
    let a = document.createElement('a')
    a.style.display = 'none'
    a.href = data
    a.download = 'hc-scaffold.yml'
    this.ROOT.appendChild(a)
    a.click()
    this.ROOT.removeChild(a)
    URL.revokeObjectURL(data)
  }

  /**
   * UI elements should call this to trigger re-display of yaml
   */
  $render (params, evtData) {
    // debounce this
    let timer
    setTimeout(() => {
      clearTimeout(timer)
      this._displayYaml()
    }, 300)
  }

  /**
   * Add a zome
   */
  $addZome (params, evtData) {
    this._genTemplates(this.zomesDiv, 'zome', {})
    this._displayYaml()
  }

  /**
   * Remove a zome (params.id)
   */
  $deleteZome (params, evtData) {
    this._rmTemplate(params.id)
    this._displayYaml()
  }

  /**
   * Add an entry to the zome defined by (params.id)
   */
  $addZomeEntry (params, evtData) {
    this._addZomeEntry(params.id)
    this._displayYaml()
  }

  /**
   * Delete a zome entry defined by (params.id)
   */
  $deleteZomeEntry (params, evtData) {
    this._rmTemplate(params.id)
    this._displayYaml()
  }

  /**
   * Add a function to the zome defined by (params.id)
   */
  $addZomeFunction (params, evtData) {
    this._addZomeFunction(params.id)
    this._displayYaml()
  }

  /**
   * Delete a zome function defined by (params.id)
   */
  $deleteZomeFunction (params, evtData) {
    this._rmTemplate(params.id)
    this._displayYaml()
  }

  // -- private -- //

  /**
   * Generate yaml from the UI (dom) nodes, and display it in the sidebar
   */
  _displayYaml () {
    while (this.yamlDisplay.childNodes.length) {
      this.yamlDisplay.removeChild(this.yamlDisplay.childNodes[0])
    }
    this.yamlDisplay.appendChild(document.createTextNode(this._genYaml()))
    hljs.highlightBlock(this.yamlDisplay)
  }

  /**
   * Generates a v4 compatible uuid
   */
  _genUuid () {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      let r = (Math.random() * 16) | 0
      return (c === 'x'
        ? r
        : (r & 0x3 | 0x8)).toString(16)
    })
  }

  /**
   * Render an additional entry into a zome by template id
   */
  _addZomeEntry (zomeTemplateId) {
    const parentTemplate = this.templates[zomeTemplateId]
    return this._genTemplates(parentTemplate.parent.querySelector(
      '#zomeentries-' + zomeTemplateId), 'zome-entry', {})
  }

  /**
   * Render an additional function into a zome by template id
   */
  _addZomeFunction (zomeTemplateId) {
    const parentTemplate = this.templates[zomeTemplateId]
    return this._genTemplates(parentTemplate.parent.querySelector(
      '#zomefunctions-' + zomeTemplateId), 'zome-function', {})
  }

  /**
   * ONLY INVOKE ON STARTUP
   * Loads a json blob into UI (dom) elements
   */
  _loadJson (json) {
    this.uuid = json.UUID

    this.appName.value = json.Name || ''

    if (json.Properties) {
      this.appDesc.value = json.Properties.description
    }

    for (let zome of json.Zomes) {
      let tpl = this._genTemplates(this.zomesDiv, 'zome', {})

      tpl.elems[0].querySelector('.zomename').value = zome.Name
      tpl.elems[0].querySelector('.zomedesc').value = zome.Description

      this._loadJsonEntries(zome, tpl.id)
      this._loadJsonFunctions(zome, tpl.id)
    }

    this._displayYaml()
  }

  /**
   * Used by _loadJson to add entries to a zome
   */
  _loadJsonEntries (json, zomeTemplateId) {
    for (let entry of json.Entries) {
      const tpl = this._addZomeEntry(zomeTemplateId)

      const row = tpl.elems[0]
      row.querySelector('.zome-entry-name').value = entry.Name || ''
      row.querySelector('.zome-entry-data-format').value =
        entry.DataFormat || 'json'
      row.querySelector('.zome-entry-sharing').value =
        entry.Sharing || 'public'

      if (typeof entry._ === 'string') {
        row.querySelector('.zome-entry-create').checked =
          (entry._.indexOf('c') > -1)
        row.querySelector('.zome-entry-read').checked =
          (entry._.indexOf('r') > -1)
        row.querySelector('.zome-entry-update').checked =
          (entry._.indexOf('u') > -1)
        row.querySelector('.zome-entry-delete').checked =
          (entry._.indexOf('d') > -1)
      }
    }
  }

  /**
   * Used by _loadJson to add functions to a zome
   */
  _loadJsonFunctions (json, zomeTemplateId) {
    for (let func of json.Functions) {
      if (typeof func._ === 'string' && func._.indexOf(':') === 1) {
        continue
      }

      const tpl = this._addZomeFunction(zomeTemplateId)

      const row = tpl.elems[0]

      row.querySelector('.zome-function-name').value = func.Name
      row.querySelector('.zome-function-calling-type').value = func.CallingType
      row.querySelector('.zome-function-exposure').value = func.Exposure
    }
  }

  /**
   * Generates a JSON blob based off the current UI (dom) elements
   * Then passes that through `toYaml` to append the annotation comments
   */
  _genYaml () {
    let json = {}

    json.UUID = this.uuid

    json.Name = this.appName.value
    let props = json.Properties = {}

    props.description = this.appDesc.value

    props.language = i18n.getLocale()

    json.Zomes = this._genZomesJson()

    localStorage.setItem(SAVE_JSON_KEY, JSON.stringify(json))

    return toYaml(json)
  }

  /**
   * Used by _genYaml to add zomes
   */
  _genZomesJson () {
    const zomes = this.zomesDiv.querySelectorAll('.zome')
    const data = []

    for (let zome of zomes) {
      const obj = {}

      obj.Name = zome.querySelector('.zomename').value
      obj.Description = zome.querySelector('.zomedesc').value

      obj.Entries = this._genZomeEntryJson(zome)

      obj.Functions = this._genZomeFunctionJson(zome)

      data.push(obj)
    }

    return data
  }

  /**
   * Used by _genYaml to add entries to a zome
   */
  _genZomeEntryJson (parent) {
    const rows = parent.querySelectorAll('.zome-entry-row')
    const data = []

    for (let row of rows) {
      const obj = {}

      const name = row.querySelector('.zome-entry-name').value
      if (!name.trim().length) {
        continue
      }

      obj.Name = name
      obj.DataFormat = row.querySelector('.zome-entry-data-format').value
      obj.Sharing = row.querySelector('.zome-entry-sharing').value

      let hint = ''
      row.querySelector('.zome-entry-create').checked && (hint += 'c')
      row.querySelector('.zome-entry-read').checked && (hint += 'r')
      row.querySelector('.zome-entry-update').checked && (hint += 'u')
      row.querySelector('.zome-entry-delete').checked && (hint += 'd')

      if (!hint.length) {
        hint = '-'
      }

      obj._ = hint

      data.push(obj)
    }

    return data
  }

  /**
   * Used by _genYaml to add functions to a zome
   */
  _genZomeFunctionJson (parent) {
    const data = []

    const addFunction = (name, callingType, exposure, hint) => {
      const obj = {
        Name: name,
        CallingType: callingType,
        Exposure: exposure
      }

      if (hint) {
        obj._ = hint
      }

      data.push(obj)
    }

    // first go through the entries and add CRUD functions
    const entryRows = parent.querySelectorAll('.zome-entry-row')
    for (let row of entryRows) {
      const name = row.querySelector('.zome-entry-name').value
      if (!name.trim().length) {
        continue
      }

      if (row.querySelector('.zome-entry-create').checked) {
        addFunction(name + 'Create',
          row.querySelector('.zome-entry-data-format').value,
          row.querySelector('.zome-entry-sharing').value,
          'c:' + name
        )
      }

      if (row.querySelector('.zome-entry-read').checked) {
        addFunction(name + 'Read',
          row.querySelector('.zome-entry-data-format').value,
          row.querySelector('.zome-entry-sharing').value,
          'r:' + name
        )
      }

      if (row.querySelector('.zome-entry-update').checked) {
        addFunction(name + 'Update',
          row.querySelector('.zome-entry-data-format').value,
          row.querySelector('.zome-entry-sharing').value,
          'u:' + name
        )
      }

      if (row.querySelector('.zome-entry-delete').checked) {
        addFunction(name + 'Delete',
          row.querySelector('.zome-entry-data-format').value,
          row.querySelector('.zome-entry-sharing').value,
          'd:' + name
        )
      }
    }

    // next go through the manually defined functions
    const rows = parent.querySelectorAll('.zome-function-row')
    for (let row of rows) {
      const name = row.querySelector('.zome-function-name').value
      if (!name.trim().length) {
        continue
      }
      addFunction(
        name,
        row.querySelector('.zome-function-calling-type').value,
        row.querySelector('.zome-function-exposure').value
      )
    }

    return data
  }

  /**
   * See if we have a binding data attribute... if we do,
   * bind it. Then recurse into child nodes.
   */
  _recBind (elem) {
    for (let child of elem.childNodes) {
      this._recBind(child)
    }
    if (!elem.getAttribute) {
      return
    }
    let events = elem.getAttribute('data-hc-bind')
    if (!events) {
      return
    }
    events = events.split(/\s+/)

    let params = {}
    let attrs = Object.keys(elem.attributes)
    for (let aidx = 0; aidx < attrs.length; ++aidx) {
      let attr = elem.attributes[attrs[aidx]]
      if (attr.name && attr.name.startsWith('data-hc-')) {
        params[attr.name.substr(8)] =
          attr.value || attr.nodeValue || attr.textContent
      }
    }

    for (let event of events) {
      let evtName = event.split(':')
      let fnName = evtName[1]
      evtName = evtName[0]
      elem.addEventListener(evtName, (evt) => {
        if (typeof this[fnName] !== 'function') {
          throw new Error('bad bind ' + fnName)
        }
        return this[fnName](JSON.parse(JSON.stringify(params)), {
          elem: elem,
          evtName: evtName,
          evt: evt
        })
      }, false)
    }
  }

  /**
   * I don't know why we care, but generate ids that are hard to guess
   * what the next one will be
   */
  _genId () {
    const out = this.nextTemplateId.toString(36).replace(/\./g, '-')
    this.nextTemplateId += Math.random()
    return out
  }

  /**
   * Given a parent dom node, instantiate a template into dom elements
   * and append those elements. Make sure any nodes with binding attributes
   * are bound (_recBind). Includes special handling for tables.
   */
  _genTemplates (parent, name, data) {
    const template = {
      __: __,
      elems: [],
      parent: parent,
      id: name + '-' + this._genId()
    }
    for (let key in data) {
      template[key] = data[key]
    }

    let d
    if (parent.nodeName === 'TABLE') {
      d = document.createElement('table')
    } else {
      d = document.createElement('div')
    }
    d.innerHTML = handlebars.templates[name](template)
    this._recBind(d)

    if (parent.nodeName === 'TABLE') {
      while (d.rows.length) {
        let r = d.rows[0]
        d.deleteRow(0)
        template.elems.push(r)
        parent.querySelector('tbody').appendChild(r)
      }
    } else {
      for (let c of d.childNodes) {
        d.removeChild(c)
        template.elems.push(c)
        parent.appendChild(c)
      }
    }

    this.templates[template.id] = template
    return template
  }

  /**
   * Delete a template from the dom tree, and clean up our refs.
   */
  _rmTemplate (id) {
    let template = this.templates[id]
    if (template.parent.nodeName === 'TABLE') {
      for (let row of template.elems) {
        template.parent.querySelector('tbody').removeChild(row)
      }
    } else {
      for (let elem of template.elems) {
        template.parent.removeChild(elem)
      }
    }
    delete this.templates[template.id]
    template.parent = null
    template.elems = null
  }
}

// entrypoint
main()
function main () {
  let quickStart = new QuickStart()
  quickStart.run()
}
