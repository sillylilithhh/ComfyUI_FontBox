import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { BBoxEditor } from "./editor.js";
import { BackgroundWatcher, imageViewURL } from "./background.js";

const editors = new WeakMap();
const backgrounds=new WeakMap(),activeBackgrounds=new Set();
function ensureSockets(node){
    if(node.comfyClass==="FontBoxFitBoxAspect"&&typeof node.addInput==="function"&&!node.inputs?.some(i=>i.name==="instruction"))node.addInput("instruction","STRING");
    const specs=node.comfyClass==="LoRABoundingBoxEditor"?[["elements","ARRAY"],["bbox","BOUNDING_BOX"],["mask","MASK"],["preview","IMAGE"],["prompt","STRING"],["instruction","STRING"],["elements_json","STRING"]]:node.comfyClass==="FontBoxFitBoxAspect"?[["elements","ARRAY"],["bbox","BOUNDING_BOX"],["mask","MASK"],["preview","IMAGE"],["elements_json","STRING"],["prompt","STRING"]]:null;
    if(specs&&typeof node.addOutput==="function")for(let i=(node.outputs||[]).length;i<specs.length;i++)node.addOutput(...specs[i]);
}
app.registerExtension({
    name: "fontbox.editor",
    getCustomWidgets() {
        return { LORA_BBOX_EDITOR(node, inputName, inputData) {
            const host=document.createElement("div");
            const editor=new BBoxEditor(host,{
                dimensions:()=>[node.widgets?.find(w=>w.name==="width")?.value||1024,
                    node.widgets?.find(w=>w.name==="height")?.value||1024],
                onChange:()=>node.graph?.setDirtyCanvas(true,true),
            });
            let watcher;
            const widget=node.addDOMWidget(inputName,"LORA_BBOX_EDITOR",host,{
                getValue:()=>editor.serialize(),setValue:value=>editor.load(value),
                getMinHeight:()=>560,getMaxHeight:()=>560,getHeight:()=>560,hideOnZoom:false,
                // ComfyUI must not select/reframe the node when a nested text field gains focus.
                selectOn:[],
                afterResize:()=>editor.fit(),
                onDraw:()=>watcher?.refresh(),
            });
            widget.computeSize=width=>[width,560];
            widget.serializeValue=()=>editor.serialize();
            const originalRemove=widget.onRemove;
            widget.onRemove=function(...args){watcher?.stop();activeBackgrounds.delete(watcher);editor.destroy();return originalRemove?.apply(this,args);};
            editor.load(inputData[1]?.default);editors.set(node,editor);
            watcher=new BackgroundWatcher(node,editor,app,api);backgrounds.set(node,watcher);activeBackgrounds.add(watcher);
            // A node has no attached graph while its widgets are constructed.
            // Optional preview work must never abort creation of the editor.
            queueMicrotask(()=>watcher.start());
            return {widget};
        }};
    },
    nodeCreated(node) {
        ensureSockets(node);
        if(node.comfyClass!=="LoRABoundingBoxEditor")return;
        if(node.title==="LoRA Bounding Box Editor")node.title="FontBox";
        node.setSize([Math.max(640,node.size[0]),Math.max(680,node.size[1])]);
        backgrounds.get(node)?.start();
    },
    loadedGraphNode(node) {
        ensureSockets(node);
        if(node.comfyClass==="LoRABoundingBoxEditor"&&node.title==="LoRA Bounding Box Editor")node.title="FontBox";
        editors.get(node)?.render();
        backgrounds.get(node)?.start();backgrounds.get(node)?.refresh();
    },
    setup() {
        api.addEventListener("executed",event=>{
            for(const watcher of activeBackgrounds)watcher.refresh();
            const data=event.detail;const graph=app.rootGraph||app.graph;
            const node=graph?.getNodeById(data.node)||app.graph?.getNodeById(data.node);
            const editor=node&&editors.get(node);if(!editor||!data.output?.lora_bbox_state)return;
            editor.sync(data.output,image=>imageViewURL(api,image),{skipBackground:!!backgrounds.get(node)?.ownsBackground});
        });
    },
});
