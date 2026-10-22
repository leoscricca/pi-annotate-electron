const { app, ipcMain } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { bootSyntheticWorkspace, rendererUrl } = require('../../scripts/electron-annotations/bootstrap.cjs')
const { AnnotationController } = require('../../scripts/electron-annotations/controller.cjs')
const { parseRenderer, admitRenderer } = require('../../scripts/electron-annotations/protocol.cjs')
let window, controller, context
let generation = 0
let frames = 0
const report = { flows: [], failures: [], refusals: [], exits: [], operations: [], error: null }
const register = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, listener) => register(channel, (event, ...args) => {
  if (channel.startsWith('conversation:') && channel !== 'conversation:get-snapshot') report.operations.push(channel)
  return listener(event, ...args)
})
const main = code => window.webContents.executeJavaScript(code).catch(error => { report.failedScript = code; throw error })
const world = code => window.webContents.executeJavaScriptInIsolatedWorld(1004, [{ code }])
async function until(read, name) {
  const end = Date.now() + 8000
  while (Date.now() < end) { if (await read()) return; await new Promise(resolve => setTimeout(resolve, 20)) }
  throw new Error('FLOW_CONDITION_' + name)
}
ipcMain.handle('cnc:electron-annotation', (event, value) => {
  if (!admitRenderer(event, window, rendererUrl)) throw new Error('ANNOTATION_SENDER_REFUSED')
  const packet = parseRenderer(value)
  if (packet.kind === 'hello') return { version: 1, scope: 'synthetic-annotation' }
  if (packet.kind === 'status') return { phase: 'idle' }
  return controller.receive(packet)
})
async function state() {
  return main(`({ overlay: !!document.getElementById('pi-panel'), settings: [...document.querySelectorAll('[role=dialog] button')].some(element => element.textContent.trim() === 'Connect Codex'), bridge: typeof window.__CNC_ELECTRON_ANNOTATION__, cursor: document.body.style.cursor, draft: document.querySelector('.cm-content').textContent, focus: document.activeElement.textContent.trim(), selection: getSelection().toString(), scroll: scrollY })`)
}
async function focusTarget() {
  await main(`(() => {
    const button = [...document.querySelectorAll('[role=dialog] button')].find(element => element.textContent.trim() === 'Connect Codex');
    button.style.setProperty('user-select', 'text', 'important');
    button.focus({preventScroll:true});
    const text = document.createTreeWalker(button, NodeFilter.SHOW_TEXT).nextNode();
    const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, 7);
    getSelection().removeAllRanges(); getSelection().addRange(range);
    return { selection: getSelection().toString(), range: range.toString(), ranges: getSelection().rangeCount, style: getComputedStyle(button).userSelect, inert: !!button.closest('[inert]'), text: text.textContent };
  })()` ).then(value => { report.selectionSetup = value; if (value.selection !== 'Connect') throw new Error('FIXTURE_SELECTION_NOT_ESTABLISHED') })
}
async function drive(mode, request, failure, geometry = false, cameraOff = false, keyboard = false) {
  await focusTarget()
  const beforeFrames = frames
  const outcome = controller.start({ request, generation, mode, timeoutMs: 15000 }).then(value => ({ value }), error => ({ error: error.message }))
  await until(() => world("!!document.getElementById('pi-panel')"), 'PANEL')
  if (geometry === 'unknown') await main("(() => {const element=document.createElement('span');element.id='synthetic-unknown-region';element.textContent='Unknown region';element.style.cssText='display:block;width:100px;height:30px;position:absolute;left:24px;top:440px';document.querySelector('[role=dialog]').appendChild(element)})()")
  if (keyboard) {
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' })
  }
  else if (process.argv.includes('--annotation-native-pointer')) {
    const point = await world(`(() => {
      const button = ${geometry === 'unknown' ? "document.getElementById('synthetic-unknown-region')" : geometry ? "document.getElementById('synthetic-geometry-control')" : "[...document.querySelectorAll('[role=dialog] button')].find(element => element.textContent.trim() === 'Connect Codex')"};
      const r = button.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    })()`)
    ;(report.pointerTargets ??= []).push({ geometry, point, hit: await world(`(() => { const e=document.elementFromPoint(${point.x},${point.y}); return { viewport: {width:innerWidth,height:innerHeight}, name:e?.textContent.trim().slice(0,80)??null, tag:e?.tagName??null }; })()`) })
    const paint = () => world(`getComputedStyle(document.elementFromPoint(${point.x},${point.y}).closest('button') || document.elementFromPoint(${point.x},${point.y})).backgroundImage`)
    window.webContents.sendInputEvent({ type: 'mouseMove', ...point })
    window.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 })
    if (geometry !== 'unknown') await until(() => world(`(() => {const e=document.elementFromPoint(${point.x},${point.y});return (e?.closest('button') || e)?.matches(':active') === true})()`), 'POINTER_PRESS')
    const pressed = await paint()
    window.webContents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 })
    await until(() => world(`!document.querySelector(':active')`), 'POINTER_RELEASE')
    const hover = await paint()
    ;(report.pointerPaints ??= []).push({ hover, pressed })
  }
  else await world(`(() => {
    const button = ${geometry === 'unknown' ? "document.getElementById('synthetic-unknown-region')" : geometry ? "document.getElementById('synthetic-geometry-control')" : "[...document.querySelectorAll('[role=dialog] button')].find(element => element.textContent.trim() === 'Connect Codex')"};
    const bounds = button.getBoundingClientRect();
    button.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: bounds.left + 3, clientY: bounds.top + bounds.height / 2 }));
    button.click();
  })()`)
  if (failure !== 'unknown') {
  await until(() => world("!!document.querySelector('.pi-note-textarea')"), 'NOTE')
  if (cameraOff) await world("document.querySelector('.pi-note-screenshot').click()")
  if (failure === 'canvas') await world('void (() => { window.__savedCanvasContext = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = () => null })()')
  if (failure === 'challenge') await main("(() => {const node=document.createElement('div');node.className='codex-device-challenge';node.textContent='SYNTHETIC_CHALLENGE';document.body.appendChild(node)})()")
  if (failure === 'capture') { window.webContents.__savedCapture = window.webContents.capturePage; window.webContents.capturePage = async () => { throw new Error('SYNTHETIC_CAPTURE_ERROR') } }
  if (failure === 'stale') {
    window.webContents.__savedCapture = window.webContents.capturePage
    window.webContents.capturePage = async (...args) => {
      const image = await window.webContents.__savedCapture(...args)
      await main("[...document.querySelectorAll('[role=dialog] button')].find(element=>element.textContent.trim()==='Connect Codex').style.transform='translateX(40px)'")
      return image
    }
  }
  if (process.argv.includes('--annotation-native-pointer')) {
    for (const selector of ['.pi-note-textarea', '#pi-submit']) {
      const point = await world(`(() => {const r=document.querySelector('${selector}').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`)
      window.webContents.sendInputEvent({ type: 'mouseMove', ...point })
      window.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 })
      window.webContents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 })
      if (selector === '.pi-note-textarea') {
        await until(() => world("document.activeElement === document.querySelector('.pi-note-textarea')"), 'NOTE_FOCUSED')
        await window.webContents.insertText('Reduce the Settings button padding')
      }
    }
  } else await world(`(() => {
    const note = document.querySelector('.pi-note-textarea'); note.focus();
    note.value = 'Reduce the Settings button padding'; note.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('pi-submit').click();
  })()`)
  }
  const result = await outcome
  if (failure === 'canvas') await world('HTMLCanvasElement.prototype.getContext = window.__savedCanvasContext; delete window.__savedCanvasContext')
  if (failure === 'challenge') await main("document.querySelector('.codex-device-challenge').remove()")
  if (failure === 'capture' || failure === 'stale') { window.webContents.capturePage = window.webContents.__savedCapture; delete window.webContents.__savedCapture }
  if (failure === 'stale') await main("[...document.querySelectorAll('[role=dialog] button')].find(element=>element.textContent.trim()==='Connect Codex').style.transform=''")
  if (failure) {
    report.failures.push({ failure, refused: !!result.error, captures: fs.readdirSync(path.join(context.root, 'captures')).length,
      hidden: !window.isVisible() && !window.isFocused(), phase: controller.lane.status().phase, frames: frames - beforeFrames, restored: await state() })
    return
  }
  if (result.error) throw new Error('FLOW_' + mode + '_' + result.error)
  report.flows.push({ mode, result: result.value, restored: await state(), lane: controller.lane.status(), frames: frames - beforeFrames })
}
async function privacyRefusals() {
  report.privacyRefusals = []
  for (const name of ['static', 'button', 'gradient', 'image', 'compound', 'pseudo', 'generated-text', 'known-paint-rest', 'wrong-state', 'wrong-theme', 'transcript']) {
    if (name === 'transcript') {
      const created = await main(`(async () => {
        const s=await window.conversation.getSnapshot();
        const r=await window.conversation.newSession({workspaceId:s.workspaceId,expectedSessionId:s.sessionId,expectedConnectionRevision:s.connection.revision,expectedConfigurationRevision:s.configurationRevision,mode:'offline'});
        return r.accepted;
      })()`)
      if (!created) throw new Error('SYNTHETIC_OFFLINE_SESSION_NOT_CREATED')
      await until(() => main("(async () => {const value=await window.conversation.getSnapshot();return value.mode==='offline' && value.available.sendInput})()"), 'OFFLINE_READY')
      const accepted = await main(`(async () => {
        const s=await window.conversation.getSnapshot();
        const r=await window.conversation.sendInput({workspaceId:s.workspaceId,expectedSessionId:s.sessionId,expectedConnectionRevision:s.connection.revision,expectedConfigurationRevision:s.configurationRevision,text:'SYNTHETIC_UNAPPROVED_TRANSCRIPT_783'});
        return r.accepted;
      })()`)
      if (!accepted) throw new Error('SYNTHETIC_TRANSCRIPT_NOT_CREATED')
      await until(() => main("document.body.textContent.includes('SYNTHETIC_UNAPPROVED_TRANSCRIPT_783')"), 'TRANSCRIPT')
    } else if (['gradient', 'image', 'compound', 'pseudo', 'generated-text', 'known-paint-rest', 'wrong-state', 'wrong-theme'].includes(name)) {
      const known = 'linear-gradient(rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.06))'
      const image = 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22%3E%3Ctext%3ESYNTHETIC_UNAPPROVED_IMAGE%3C/text%3E%3C/svg%3E")'
      await main(`(() => {
        const button=[...document.querySelectorAll('[role=dialog] button')].find(e=>e.textContent.trim()==='Connect Codex');
        if (${JSON.stringify(name)} === 'pseudo' || ${JSON.stringify(name)} === 'generated-text') {const s=document.createElement('style');s.id='synthetic-unapproved-content';s.textContent=${JSON.stringify(name === 'pseudo' ? `#fixture-settings button::before {content:"";background-image:${known}}` : '#fixture-settings button::before {content:"SYNTHETIC_UNAPPROVED_PSEUDO"}')};document.head.appendChild(s)}
        else button.style.backgroundImage=${JSON.stringify(name === 'gradient' ? 'linear-gradient(rgb(1, 2, 3), rgb(4, 5, 6))' : name === 'image' ? image : name === 'compound' ? known + ', ' + image : name === 'wrong-state' ? 'linear-gradient(rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.1))' : name === 'wrong-theme' ? 'linear-gradient(rgba(0, 0, 0, 0.04), rgba(0, 0, 0, 0.04))' : known)};
      })()`)
      const point = name === 'known-paint-rest' ? {x:1,y:1} : await main("(() => {const r=[...document.querySelectorAll('[role=dialog] button')].find(e=>e.textContent.trim()==='Connect Codex').getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()")
      window.webContents.sendInputEvent({ type:'mouseMove', ...point })
      await until(() => main(`[...document.querySelectorAll('[role=dialog] button')].find(e=>e.textContent.trim()==='Connect Codex').matches(':hover') === ${name !== 'known-paint-rest'}`), 'PAINT_POINTER_STATE')
    } else {
      await main(`(() => {const e=document.createElement('${name === 'button' ? 'button' : 'section'}');e.id='synthetic-unapproved-content';e.textContent='SYNTHETIC_UNAPPROVED_${name.toUpperCase()}_783';document.querySelector('[role=dialog]').appendChild(e)})()`)
    }
    const beforeFrames = frames, beforeFiles = fs.readdirSync(path.join(context.root, 'captures')).length
    let active
    const activated = new Promise(resolve => { active = resolve })
    const execute = controller.world.bind(controller)
    controller.world = async code => { const value = await execute(code); if (code.includes('__CNC_ANNOTATION_CONTROL__.start(')) active({ active: true }); return value }
    const outcome = controller.start({ request: 'preexisting-' + name, generation, mode: 'crop', timeoutMs: 5000 })
      .then(value => ({ value }), error => ({ error: error.message }))
    const first = await Promise.race([activated, outcome])
    if (first.active) {
      await world(`(() => {
        const button=${name === 'button' ? "document.getElementById('synthetic-unapproved-content')" : "[...document.querySelectorAll('[role=dialog] button')].find(e=>e.textContent.trim()==='Connect Codex')"};
        const r=button.getBoundingClientRect();button.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:r.left+3,clientY:r.top+r.height/2}));button.click();
      })()`)
      await until(() => world("!!document.querySelector('.pi-note-textarea')"), 'PRIVACY_NOTE')
      await world("(() => {const n=document.querySelector('.pi-note-textarea');n.value='Synthetic refusal test';n.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('pi-submit').click()})()")
    }
    const result = await outcome
    controller.world = execute
    report.privacyRefusals.push({name,error:result.error??null,delivered:!!result.value,frames:frames-beforeFrames,files:fs.readdirSync(path.join(context.root,'captures')).length-beforeFiles})
    if (['gradient', 'image', 'compound', 'known-paint-rest', 'wrong-state', 'wrong-theme'].includes(name)) await main("[...document.querySelectorAll('[role=dialog] button')].find(e=>e.textContent.trim()==='Connect Codex').style.backgroundImage=''")
    else if (name !== 'transcript') await main("document.getElementById('synthetic-unapproved-content').remove()")
    window.webContents.sendInputEvent({ type:'mouseMove', x:1, y:1 })
  }
}
async function omittedRegionRefusals(ordinaryStage) {
  const ordinary = !!ordinaryStage
  const rows = report[ordinary ? 'ordinaryRefusals' : 'omittedRefusals'] = []
  const names = ordinary
    ? ['ordinary-border', 'ordinary-mask', 'ordinary-list', 'pseudo-border', 'pseudo-mask', 'marker-content', 'scrollbar-image', 'root-background', 'svg-fill', 'svg-stroke', 'filter-url']
      // The note modal removes scrollbar paint. Do not count a dormant pseudo as rendered media.
      .filter(name => ordinaryStage !== 'submit' || name !== 'scrollbar-image')
    : ['badge-before-image', 'badge-after-image', 'cursor-desc-image', 'cursor-desc-generated', 'cursor-desc-pseudo-image', 'selection-desc-image', 'selection-desc-generated', 'selection-desc-pseudo-image']
  for (const stage of ordinary ? [ordinaryStage] : ['preexisting', 'selection', 'submit']) for (const name of names) {
    await focusTarget()
    if (ordinary) await main(`(() => {
      const style=document.createElement('style');style.id='synthetic-ordinary-setup';
      style.textContent=${JSON.stringify(name === 'ordinary-list' || name === 'marker-content' ? '#fixture-settings button{display:list-item;list-style-position:inside}' : name.startsWith('pseudo-') ? '#fixture-settings button{position:relative}#fixture-settings button::before{content:"";position:absolute;left:0;top:0;width:100px;height:32px;pointer-events:none}' : name === 'scrollbar-image' ? '#fixture-settings{height:12px!important;overflow-y:scroll!important;scrollbar-width:auto!important}#fixture-settings::-webkit-scrollbar{display:block!important;width:8px!important}' : '')};
      document.head.appendChild(style);
      if(${JSON.stringify(name.startsWith('svg-'))}) {
        const element=document.querySelector('[role=dialog] svg path');if(!element)throw Error('SVG_PATH_MISSING');
        window.__syntheticOrdinarySVG={element,style:element.getAttribute('style')};
        element.style.setProperty(${JSON.stringify(name === 'svg-fill' ? 'fill' : 'stroke')},'var(--synthetic-ordinary-paint, none)','important');
      }
    })()`)
    if (!ordinary && !name.startsWith('badge-')) await main(`(() => {
      const layer=document.createElement('div');layer.id='synthetic-omitted-layer';layer.className=${JSON.stringify(name.startsWith('cursor-') ? 'cm-cursorLayer' : 'cm-selectionLayer')};
      const child=document.createElement('div');child.id='synthetic-omitted-child';layer.appendChild(child);document.body.appendChild(layer);
    })()`)
    const applyPaint = async () => {
      if (ordinary) {
        const svg=encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="32"><defs><pattern id="paint" patternUnits="userSpaceOnUse" width="100" height="32"><rect width="100" height="32" fill="red"/><text y="20">SYNTHETIC_ORDINARY_IMAGE</text></pattern><filter id="filter"><feFlood flood-color="red"/></filter></defs><rect width="100" height="32" fill="white"/><text y="20">SYNTHETIC_ORDINARY_IMAGE</text></svg>')
        const selector=name === 'root-background' ? 'html' : name === 'scrollbar-image' ? '#fixture-settings' : name.startsWith('svg-') ? '[role=dialog] svg path' : '#fixture-settings button'
        const pseudo=name.startsWith('pseudo-') ? '::before' : name === 'marker-content' ? '::marker' : name === 'scrollbar-image' ? '::-webkit-scrollbar-thumb' : ''
        const property=name.endsWith('border') ? 'border-image-source' : name.endsWith('mask') ? 'mask-image' : name === 'ordinary-list' ? 'list-style-image' : name === 'marker-content' ? 'content' : name === 'svg-fill' ? 'fill' : name === 'svg-stroke' ? 'stroke' : name === 'filter-url' ? 'filter' : 'background-image'
        const url=`url("data:image/svg+xml,${svg}${name.startsWith('svg-') ? '#paint' : name === 'filter-url' ? '#filter' : ''}")`
        const extras=name.startsWith('svg-') ? ' !important' : property === 'border-image-source' ? ';border-image-slice:0 fill' : property === 'mask-image' ? ';mask-mode:luminance;mask-size:100% 100%;mask-repeat:no-repeat' : ''
        let probe=await main(`(() => {
          const style=document.createElement('style');style.id='synthetic-omitted-style';
          style.textContent=${JSON.stringify(selector+pseudo+'{'+(name.startsWith('svg-') ? '--synthetic-ordinary-paint' : property)+':'+url+extras+'}')};document.head.appendChild(style);
          const element=document.querySelector(${JSON.stringify(selector)});
          if(!element)return {valid:false,reason:'missing',svg:[...document.querySelectorAll('svg')].slice(0,5).map(e=>({tag:e.parentElement.tagName,id:e.parentElement.id,width:e.getBoundingClientRect().width}))};
          const value=getComputedStyle(element,${JSON.stringify(pseudo||null)}).getPropertyValue(${JSON.stringify(property)}),rect=element.getBoundingClientRect();
          return {valid:value.includes('SYNTHETIC_ORDINARY_IMAGE') && rect.width>0 && rect.height>0,property:${JSON.stringify(property)},value,width:rect.width,height:rect.height,matched:element.matches(${JSON.stringify(selector)}),specified:style.sheet?.cssRules[0]?.style?.getPropertyValue(${JSON.stringify(property)}),inline:element.style.cssText};
        })()`)
        if(!probe.valid && probe.reason!=='missing') {
          // Chromium can update scrollbar pseudo paint after the stylesheet task.
          await until(()=>main(`getComputedStyle(document.querySelector(${JSON.stringify(selector)}),${JSON.stringify(pseudo||null)}).getPropertyValue(${JSON.stringify(property)}).includes('SYNTHETIC_ORDINARY_IMAGE')`),'ORDINARY_COMPUTED_PAINT_'+name)
          probe={...probe,...await main(`(() => {const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect(),value=getComputedStyle(e,${JSON.stringify(pseudo||null)}).getPropertyValue(${JSON.stringify(property)});return {valid:value.includes('SYNTHETIC_ORDINARY_IMAGE')&&r.width>0&&r.height>0,value,width:r.width,height:r.height}})()`)}
        }
        if(!probe.valid)throw Error('ORDINARY_PAINT_NOT_RENDERABLE_'+name+'_'+JSON.stringify(probe))
        ;(report.paintProbes??=[]).push({stage,name,...probe})
        return
      }
      const selector = name.startsWith('badge-') ? '#cnc-annotation-synthetic' : '#synthetic-omitted-child'
      const pseudo = name.startsWith('badge-') ? (name.includes('before') ? '::before' : '::after') : name.includes('generated') ? '::before' : name.includes('pseudo-image') ? '::after' : ''
      const svg = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="32"><rect width="100" height="32" fill="red"/><text y="20">SYNTHETIC_OMITTED_IMAGE</text></svg>')
      const content = name.includes('generated') ? '"SYNTHETIC_OMITTED_TEXT"' : '""'
      const image = name.includes('generated') ? 'none' : `url("data:image/svg+xml,${svg}")`
      return main(`(() => {
        const rect=[...document.querySelectorAll('[role=dialog] button')].find(e=>e.textContent.trim()==='Connect Codex').getBoundingClientRect();
        const style=document.createElement('style');style.id='synthetic-omitted-style';
        style.textContent=${JSON.stringify(selector + pseudo)}+'{content:'+${JSON.stringify(content)}+';background-image:'+${JSON.stringify(image)}+';position:fixed;left:'+rect.x+'px;top:'+rect.y+'px;width:100px;height:32px;display:block;visibility:visible;opacity:1;pointer-events:none;z-index:2147483646}';
        document.head.appendChild(style);
        const paint=getComputedStyle(document.querySelector(${JSON.stringify(selector)}),${JSON.stringify(pseudo || null)});
        if (parseFloat(paint.width)!==100 || parseFloat(paint.height)!==32 || paint.visibility!=='visible'
          || !(${JSON.stringify(name.includes('generated'))} ? paint.content.includes('SYNTHETIC_OMITTED_TEXT') : paint.backgroundImage.includes('SYNTHETIC_OMITTED_IMAGE'))) throw Error('OMITTED_SENTINEL_NOT_RENDERABLE');
      })()`)
    }
    if (stage === 'preexisting') await applyPaint()
    const beforeFrames=frames, beforeFiles=fs.readdirSync(path.join(context.root,'captures')).length
    let active, settled
    const activated=new Promise(resolve=>{active=resolve}), execute=controller.world.bind(controller)
    controller.world=async code=>{const value=await execute(code);if(code.includes('__CNC_ANNOTATION_CONTROL__.start('))active({active:true});return value}
    const outcome=controller.start({request:'omitted-'+stage+'-'+name,generation,mode:'crop',timeoutMs:5000})
      .then(value=>(settled={value}),error=>(settled={error:error.message}))
    const first=await Promise.race([activated,outcome])
    if (first.active) {
      if (stage === 'selection') await applyPaint()
      await world(`(() => {const b=[...document.querySelectorAll('[role=dialog] button')].find(e=>e.textContent.trim()==='Connect Codex');const r=b.getBoundingClientRect();b.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:r.left+3,clientY:r.top+r.height/2}));b.click()})()`)
      await until(async()=>!!settled || await world("!!document.querySelector('.pi-note-textarea')"),'OMITTED_NOTE_OR_REFUSAL')
      if (!settled) {
        if (stage === 'submit') await applyPaint()
        // A capture guard can settle and remove the note during the async paint probe.
        if (!settled) await world("(() => {const n=document.querySelector('.pi-note-textarea');if(!n)return;n.value='Synthetic omitted-region refusal';n.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('pi-submit').click()})()")
      }
    }
    const result=await outcome
    controller.world=execute
    rows.push({stage,name,error:result.error??null,delivered:!!result.value,frames:frames-beforeFrames,
      files:fs.readdirSync(path.join(context.root,'captures')).length-beforeFiles,idle:controller.lane.status().phase==='idle',overlay:await world("!!document.getElementById('pi-panel')")})
    if (ordinary && result.value) (report.ordinaryImages??=[]).push({stage,name,images:result.value.images})
    await main("document.getElementById('synthetic-omitted-style')?.remove();document.getElementById('synthetic-omitted-layer')?.remove();document.getElementById('synthetic-ordinary-setup')?.remove();if(window.__syntheticOrdinarySVG){const s=window.__syntheticOrdinarySVG;s.style===null?s.element.removeAttribute('style'):s.element.setAttribute('style',s.style);delete window.__syntheticOrdinarySVG}")
  }
  if (ordinary) return
  await focusTarget()
  await main(`(() => {
    for (const [selector, id] of [['.cm-cursorLayer','synthetic-plain-cursor'],['.cm-selectionLayer','synthetic-plain-selection']]) {
      // This app can use native selection without drawn layers. Construct the supported plain layer shape explicitly.
      const layer=document.createElement('div');layer.className=selector.slice(1);layer.id=id+'-layer';
      const rectangle=document.createElement('div');rectangle.id=id;rectangle.style.cssText='position:absolute;width:10px;height:16px;border-left:1px solid black;background-color:rgba(0,0,0,0.1)';
      rectangle.appendChild(document.createElement('span'));layer.appendChild(rectangle);document.body.appendChild(layer);
    }
  })()`)
  report.plainLayerFlows=[]
  for (const [mode, keyboard] of [['none',false],['crop',false],['none',true]]) {
    await drive(mode,'plain-layer-'+mode+'-'+keyboard,undefined,false,false,keyboard)
    const flow=report.flows.at(-1)
    report.plainLayerFlows.push({mode,keyboard,frames:flow.frames,images:flow.result.images.length,
      markers:await main("document.querySelectorAll('#synthetic-plain-cursor,#synthetic-plain-selection').length"),
      settings:flow.restored.settings,draft:flow.restored.draft,selection:flow.restored.selection,overlay:flow.restored.overlay})
  }
  await main("document.getElementById('synthetic-plain-cursor-layer').remove();document.getElementById('synthetic-plain-selection-layer').remove()")
}
async function run() {
  const width = Number(process.argv.find(value => value.startsWith('--annotation-proof-width='))?.split('=')[1] || 1280)
  window.setContentSize(width, 800)
  await until(() => main(`innerWidth === ${width}`), 'WIDTH')
  await until(() => main("!!document.getElementById('composer-model')"), 'WORKSPACE')
  await until(() => world("!!window.__CNC_ELECTRON_ANNOTATION__"), 'BRIDGE')
  await world("(() => { const badge = document.createElement('div'); badge.id='cnc-annotation-synthetic'; badge.textContent='Synthetic annotation workspace'; document.body.appendChild(badge); })()")
  await main("document.querySelector('.cm-content').focus()")
  await window.webContents.insertText('Synthetic annotation draft')
  await until(() => main("document.querySelector('.cm-content').textContent === 'Synthetic annotation draft'"), 'DRAFT')
  if (process.argv.includes('--annotation-sidebar-settings')) {
    report.settingsInitiallyClosed = await main("!document.querySelector('[role=dialog]')")
    if (!report.settingsInitiallyClosed) throw new Error('FIXTURE_SETTINGS_ALREADY_OPEN')
    const point = await main("(() => {const r=document.getElementById('sidebar-settings').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()")
    window.webContents.sendInputEvent({ type: 'mouseMove', ...point })
    window.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 })
    window.webContents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 })
    await until(() => main("document.querySelector('[role=dialog]')?.getAttribute('aria-label') === 'Settings'"), 'SETTINGS_CLICK')
    report.settingsEntryDialog = await main("document.querySelector('[role=dialog]').getAttribute('aria-label')")
  } else {
    await main("document.getElementById('composer-model').click()")
    await until(() => main("[...document.querySelectorAll('[role=menuitem]')].some(element => element.textContent.trim() === 'Manage Codex connection')"), 'MENU')
    await main("[...document.querySelectorAll('[role=menuitem]')].find(element => element.textContent.trim() === 'Manage Codex connection').click()")
  }
  await until(() => main("[...document.querySelectorAll('[role=dialog] button')].some(element => element.textContent.trim() === 'Connect Codex')"), 'DIALOG')
  await until(() => main("!document.querySelector('[role=menu]')"), 'MENU_CLOSED')
  if (process.argv.includes('--annotation-light')) {
    await main("document.querySelector('[role=switch][aria-label=\"Light color scheme\"]').click()")
    await until(() => main("document.body.dataset.previewColorScheme === 'light'"), 'LIGHT_THEME')
    // Re-enter the reviewed light Settings state, not the separate theme-action status.
    await main("document.getElementById('sidebar-settings-dismiss').click()")
    await until(() => main("!document.querySelector('[role=dialog]')"), 'LIGHT_SETTINGS_CLOSED')
    await main("document.getElementById('sidebar-settings').click()")
    await until(() => main("[...document.querySelectorAll('[role=dialog] button')].some(e=>e.textContent.trim()==='Connect Codex')"), 'LIGHT_SETTINGS')
  }
  await main("document.body.style.cursor='help';document.documentElement.style.height='auto';document.documentElement.style.overflow='auto';document.body.style.height='1800px';document.body.style.overflow='visible';window.scrollTo(0,120)")
  await until(() => main('scrollY === 120'), 'SCROLL')
  const ordinaryStage=process.argv.find(value=>value.startsWith('--annotation-ordinary-paint='))?.split('=')[1]
  if (ordinaryStage) { if(!['preexisting','selection','submit'].includes(ordinaryStage))throw Error('INVALID_ORDINARY_STAGE');await omittedRegionRefusals(ordinaryStage);return }
  if (process.argv.includes('--annotation-privacy-refusals')) { await privacyRefusals(); return }
  if (process.argv.includes('--annotation-omitted-regions')) { await omittedRegionRefusals(); return }
  await drive('none', 'none-flow')
  await drive('crop', 'crop-flow')
  await drive('crop', 'bad-canvas', 'canvas')
  await drive('crop', 'bad-capture', 'capture')
  await drive('crop', 'challenge-transition', 'challenge')
  await drive('crop', 'stale-capture', 'stale')
  for (const name of ['secret', 'editable', 'plaintext', 'collision']) {
    await main(`(() => { const element = document.createElement(${['collision', 'plaintext'].includes(name) ? "'div'" : "'input'"}); element.id = ${name === 'collision' ? "'pi-panel'" : "'synthetic-refusal-input'"}; ${name === 'secret' ? "element.type='password';element.value='SYNTHETIC_SECRET'" : name === 'editable' ? "element.value='SYNTHETIC_UNKNOWN_INPUT'" : name === 'plaintext' ? "element.contentEditable='plaintext-only';element.textContent='SYNTHETIC_UNKNOWN_INPUT'" : "element.textContent='Foreign picker ID'"}; document.body.appendChild(element) })()`)
    const result = await controller.start({ request: 'refusal-' + name, generation, mode: 'none', timeoutMs: 1000 }).then(() => 'unexpected', error => error.message)
    report.refusals.push({name, result})
    await main(`document.getElementById('${name === 'collision' ? 'pi-panel' : 'synthetic-refusal-input'}').remove()`)
  }
  await main("(() => { const element=document.createElement('button');element.id='synthetic-geometry-control';element.textContent='Geometry fixture';element.style.cssText='width:100px;height:40px;padding:0;border:0;box-sizing:border-box;background:rgb(245,20,30);color:white;flex:none;position:absolute;left:24px;top:380px';document.querySelector('[role=dialog]').appendChild(element) })()")
  await drive('crop', 'geometry-flow', undefined, true)
  await drive('crop', 'camera-none-flow', undefined, false, true)
  await drive('none', 'keyboard-flow', undefined, false, false, true)
  await focusTarget()
  const mixedFrames = frames
  const mixed = controller.start({request:'mixed-flow',generation,mode:'crop',timeoutMs:5000}).then(value=>({value}),error=>({error:error.message}))
  await until(() => world("!!document.getElementById('pi-panel')"), 'MIXED_PANEL')
  await world(`(() => {
    const buttons = [[...document.querySelectorAll('[role=dialog] button')].find(element=>element.textContent.trim()==='Connect Codex'), document.getElementById('synthetic-geometry-control')];
    buttons.forEach((button,index) => {
      const rect=button.getBoundingClientRect(); button.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:rect.left+3,clientY:rect.top+rect.height/2}));
      button.dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:index===1}));
      if(index===0)document.querySelector('.pi-note-screenshot').click();
    });
    document.querySelectorAll('.pi-note-textarea').forEach(note=>{note.value='Only the geometry image';note.dispatchEvent(new Event('input',{bubbles:true}))});
  })()`)
  await until(() => world("document.getElementById('pi-submit').disabled === false"), 'MIXED_SEND_READY')
  await world("document.getElementById('pi-submit').click()")
  const mixedResult = await mixed
  if (mixedResult.error) throw new Error(mixedResult.error)
  report.flows.push({mode:'crop',result:mixedResult.value,frames:frames-mixedFrames,restored:await state(),lane:controller.lane.status()})
  await drive('crop','unknown-region','unknown','unknown')
  await main("document.getElementById('synthetic-unknown-region').remove()")
  report.malformed = []
  for (const packet of [{kind:'status',path:'/SYNTHETIC_FORBIDDEN'},{kind:'authenticate'},{kind:'capture',request:'stale-request',generation:1,revision:0,mode:'none',viewport:{width:980,height:800,dpr:1,scrollX:0,scrollY:120}}]) {
    report.malformed.push(await world(`window.__CNC_ELECTRON_ANNOTATION__.invoke(${JSON.stringify(packet)}).then(()=>false,error=>String(error).includes('ANNOTATION_'))`))
  }
  for (const exit of ['escape', 'cancel']) {
    await focusTarget()
    const outcome = controller.start({request:'exit-' + exit,generation,mode:'none',timeoutMs:5000}).then(() => 'unexpected', error => error.message)
    await until(() => world("!!document.getElementById('pi-panel')"), 'EXIT_PANEL')
    if (exit === 'escape') await main("document.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'Escape'}))")
    else await controller.cancel({cancelFor:'exit-' + exit,generation})
    report.exits.push({exit,outcome:await outcome,state:await state()})
  }
  const outcome = controller.start({request:'reload-flow',generation,mode:'none',timeoutMs:5000}).then(() => 'unexpected', error => error.message)
  await until(() => world("!!document.getElementById('pi-panel')"), 'RELOAD_PANEL')
  const loaded = new Promise(resolve => window.webContents.once('did-finish-load', resolve))
  window.webContents.reload()
  await loaded
  report.reload = {outcome:await outcome,generation,overlay:await main("!!document.getElementById('pi-panel')"),phase:controller.lane.status().phase}
}
void bootSyntheticWorkspace({ preloadFile: path.resolve(__dirname, '../../scripts/electron-annotations/runtime-preload.cjs'), onWindow(candidate, receivedContext) {
  window = candidate; context = receivedContext
  const capture = candidate.webContents.capturePage.bind(candidate.webContents)
  candidate.webContents.capturePage = (...args) => { frames += 1; return capture(...args) }
  controller = new AnnotationController({ window, context, generation: () => generation, target: 'flow-target', session: 'synthetic-flow-session' })
  const execute = controller.world.bind(controller)
  report.crossDocumentExecutions = 0
  controller.world = code => {
    if (generation > 1) report.crossDocumentExecutions += 1
    if (process.argv.includes('--annotation-native-pointer')) {
      // Controlled hidden diagnostics only. No owner window or protocol contains this text.
      code = code.replace('if (!controls.has(name) || approved !== serialize(ignore)) refuse()',
        'const actual = serialize(ignore); if (!controls.has(name) || approved !== actual) { window.__CNC_POINTER_TEST_REFUSAL__ = { name, approved, actual }; refuse() }')
    }
    return execute(code)
  }
  candidate.webContents.on('did-start-navigation', details => {
    if (!details.isMainFrame) return
    generation += 1
    if (generation > 1) void controller.retireNavigation().catch(() => {})
  })
  candidate.webContents.once('did-finish-load', () => {
    void run().catch(async error => {
      report.error = error.message
      if (process.argv.includes('--annotation-native-pointer')) report.pointerRefusal = await world('window.__CNC_POINTER_TEST_REFUSAL__ ?? null').catch(() => null)
    }).finally(async () => {
      try { await controller.retire() } catch { report.cleanup = 'unconfirmed' }
      fs.writeFileSync(path.join(context.root, 'flow-report.json'), JSON.stringify(report, null, 2), { mode: 0o600, flag: 'wx' })
      app.quit()
    })
  })
} }).catch(() => app.quit())
