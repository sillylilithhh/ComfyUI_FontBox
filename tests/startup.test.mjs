// Test the shipped browser bundle, not only its source modules.
// npm install --no-save happy-dom; node tests/startup.test.mjs
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const {Window}=await import(process.env.HAPPY_DOM_PATH||'happy-dom');
const window=new Window({url:'http://localhost/'});
for(const key of ['document','Image','Event','PointerEvent','ResizeObserver','HTMLElement'])globalThis[key]=window[key];
globalThis.requestAnimationFrame=fn=>setTimeout(fn,0);
window.HTMLElement.prototype.getBoundingClientRect=()=>({left:0,top:0,width:640,height:320});
Object.defineProperty(window.HTMLElement.prototype,'clientWidth',{get(){return 640;}});
Object.defineProperty(window.HTMLElement.prototype,'clientHeight',{get(){return 320;}});
const {version}=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
const directory=new URL(`../web/fontbox-${version}/`,import.meta.url);
assert.deepEqual(await readdir(directory),[`fontbox-${version}.js`]);
let bundle=await readFile(new URL(`fontbox-${version}.js`,directory),'utf8');
assert(!/from\s+["']\.\/(?:background|model|editor|styles|positioning)/.test(bundle));
assert(!bundle.includes('editor.css", import.meta.url'));
let extension,attached=false,node;
const warnings=[],originalWarn=console.warn;console.warn=(...args)=>warnings.push(args);
const graph={getNodeById:()=>node,links:{},setDirtyCanvas(){}};
globalThis.__fontboxTestApp={graph,registerExtension(value){extension=value;}};
globalThis.__fontboxTestApi=new window.EventTarget();globalThis.__fontboxTestApi.apiURL=url=>url;
bundle=bundle.replace('import { app } from "../../scripts/app.js";','const app=globalThis.__fontboxTestApp;')
    .replace('import { api } from "../../scripts/api.js";','const api=globalThis.__fontboxTestApi;');
await import(`data:text/javascript;base64,${Buffer.from(bundle).toString('base64')}`);
const saved=JSON.stringify({version:1,revision:447,incoming_signature:null,boxes:[{id:'existing-box',origin:'local',x:.25,y:.1,w:.4,h:.15,type:'obj',mode:'change',align:'left',content:'',source:'BEFORE',replacement:'AFTER',text:''}]});
node={id:-1,comfyClass:'LoRABoundingBoxEditor',title:'FontBox',size:[640,680],inputs:[{name:'background',link:null}],
    get graph(){if(!attached)throw new Error('Graph not attached during construction');return graph;},
    widgets:[{name:'width',value:1024},{name:'height',value:1024}],setSize(size){this.size=size;},
    addDOMWidget(name,type,element,options){
        document.body.append(element);const widget={name,type,element,options};
        Object.defineProperty(widget,'value',{get:options.getValue,set:options.setValue});this.widgets.push(widget);return widget;
    }};
let widget;
assert.doesNotThrow(()=>{widget=extension.getCustomWidgets().LORA_BBOX_EDITOR(node,'editor_state',['LORA_BBOX_EDITOR',{default:saved}]).widget;extension.nodeCreated(node);});
assert.equal(JSON.parse(widget.value).boxes[0].source,'BEFORE');assert.equal(JSON.parse(widget.value).boxes[0].replacement,'AFTER');assert.equal(JSON.parse(widget.value).revision,447);
const shadow=widget.element.shadowRoot;
assert(shadow.querySelector('.editor'));assert(shadow.querySelector('.toolbar button'));assert(shadow.querySelector('.stage'));
assert(shadow.querySelector('style').textContent.includes('.context-taskbar'));assert.equal(shadow.querySelector('link[rel="stylesheet"]'),null);
assert.equal(shadow.querySelectorAll('.box').length,1);assert(!shadow.textContent.includes('UNKNOWN'));
attached=true;node.id=1;extension.loadedGraphNode(node);widget.options.onDraw();
shadow.querySelector('button[aria-label="Select / move boxes (V)"]').click();
shadow.querySelector('.box .body').dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:1,clientX:250,clientY:60,bubbles:true,cancelable:true}));
assert.equal(shadow.querySelector('.box.selected [data-key="source"]').value,'BEFORE');assert.equal(shadow.querySelector('.box.selected [data-key="replacement"]').value,'AFTER');
assert.equal(warnings.length,1);widget.onRemove();console.warn=originalWarn;await window.happyDOM.close();
console.log('Shipped bundle startup: graph unavailable during construction, embedded CSS, complete toolbar/canvas, saved-box recovery, editing, and cleanup passed.');
