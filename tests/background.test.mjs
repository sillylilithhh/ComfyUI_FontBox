import assert from 'node:assert/strict';
import {BackgroundWatcher,imageViewURL,parseImageSelection,resolveBackground} from '../frontend/background.js';

const api={apiURL:path=>`/api${path}`};
assert.deepEqual(parseImageSelection('folder name/a & b.png [output]'),{filename:'a & b.png',subfolder:'folder name',type:'output'});
assert.deepEqual(parseImageSelection({filename:'x.png',type:'temp',subfolder:'cache'}),{filename:'x.png',type:'temp',subfolder:'cache'});
assert.equal(parseImageSelection(''),null);
const url=new URL(imageViewURL(api,parseImageSelection('folder/a & b.png [input]')),'https://comfy.test');
assert.equal(url.pathname,'/api/view');assert.equal(url.searchParams.get('filename'),'a & b.png');assert.equal(url.searchParams.get('subfolder'),'folder');
const source={id:10,comfyClass:'LoadImage',widgets:[{name:'image',value:'first.png'}],inputs:[]};
const nodes=new Map([[10,source]]);
const graph={links:{1:{origin_id:10,origin_slot:0}},getNodeById:id=>nodes.get(id)};
const node={graph,inputs:[{name:'background',link:1}]},app={graph,nodeOutputs:{}};
let resolved=resolveBackground(node,app,api);assert.equal(resolved.kind,'file');assert(resolved.url.includes('first.png'));
const firstKey=resolved.key;source.widgets[0].value='second.png';resolved=resolveBackground(node,app,api);assert.notEqual(resolved.key,firstKey);
const calls=[],editor={setBackground:url=>{calls.push(url);return Promise.resolve(true);},notify(){}};
let tick,canceled=false;
const watcher=new BackgroundWatcher(node,editor,app,api,{schedule:fn=>{tick=fn;return 123;},cancel:id=>{assert.equal(id,123);canceled=true;}});
watcher.start();assert.equal(calls.length,1);tick();assert.equal(calls.length,1);
source.widgets[0].value='third.png';tick();assert.equal(calls.length,2);assert(calls[1].includes('third.png'));
source.imgs=[{src:'/api/view?filename=third.png&t=new-upload'}];tick();assert.equal(calls.length,3);
await Promise.resolve();assert.equal(watcher.status,'ready');assert(watcher.ownsBackground);
node.inputs[0].link=null;tick();assert.equal(calls.at(-1),null);assert(!watcher.ownsBackground);
watcher.stop();assert(canceled);const stopped=calls.length;tick();assert.equal(calls.length,stopped);
node.inputs[0].link=1;
source.widgets[0].value='';assert.equal(resolveBackground(node,app,api).url,null);
source.widgets[0].value='third.png';source.inputs=[{name:'image',link:99}];assert.equal(resolveBackground(node,app,api).url,null);source.inputs=[];
nodes.set(20,{id:20,comfyClass:'Reroute',inputs:[{link:2}],graph});graph.links[1]={origin_id:20,origin_slot:0};graph.links[2]={origin_id:10,origin_slot:0};
assert.equal(resolveBackground(node,app,api).kind,'file');
graph.links[2]={origin_id:20,origin_slot:0};assert.equal(resolveBackground(node,app,api).url,null);
graph.links[1]={origin_id:10,origin_slot:0};source.comfyClass='GeneratedImage';source.imgs=[];
assert.equal(resolveBackground(node,app,api).url,null);
app.nodeOutputs['10']={images:[{filename:'generated.png',type:'temp',subfolder:''}]};assert.equal(resolveBackground(node,app,api).kind,'preview');
graph.links[1].origin_slot=1;assert.equal(resolveBackground(node,app,api).url,null);
graph.links=new Map([[1,{origin_id:10,origin_slot:0}]]);assert.equal(resolveBackground(node,app,api).kind,'preview');
// A failed direct preview permits the execution-provided background fallback.
const failed=new BackgroundWatcher(node,{setBackground:()=>Promise.resolve(false),notify(){}},app,api);
failed.refresh();assert(failed.ownsBackground);await Promise.resolve();assert(!failed.ownsBackground);failed.stop();
// Background lookup happens during ComfyUI node construction, before a graph
// can be safely inspected. It must never abort the node constructor.
let attached=false,startupTick,startupReports=0;
const startupNode={get graph(){if(!attached)throw new Error('Graph not attached during construction');return graph;},inputs:node.inputs};
const startup=new BackgroundWatcher(startupNode,editor,app,api,{schedule:fn=>{startupTick=fn;return 1;},cancel(){},report(){startupReports++;}});
assert.doesNotThrow(()=>startup.start());assert.doesNotThrow(()=>startupTick());assert.equal(startupReports,1);
attached=true;startupTick();await Promise.resolve();assert.equal(startup.status,'ready');startup.stop();
// A synchronous preview failure must also leave the drawing UI usable.
const brokenPreview=new BackgroundWatcher(node,{setBackground(){throw new Error('Preview temporarily unavailable');},notify(){}},app,api,{report(){}});
assert.doesNotThrow(()=>brokenPreview.refresh());assert.equal(brokenPreview.status,'error');assert(!brokenPreview.ownsBackground);brokenPreview.stop();
console.log('Live backgrounds: file changes/uploads, URL encoding, reroutes, cached images, no-run refresh, disconnect, failure fallback, and timer cleanup passed.');
