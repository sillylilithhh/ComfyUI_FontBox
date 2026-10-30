/** Resolve images already available in ComfyUI without executing a workflow. */
export function parseImageSelection(value, defaultType="input") {
    if(value && typeof value === "object") {
        const filename=value.filename||value.name||value.asset_hash;
        return filename?{filename:String(filename),subfolder:String(value.subfolder||""),type:value.type||defaultType}:null;
    }
    if(typeof value!=="string"||!value.trim())return null;
    let path=value.trim(),type=defaultType;
    const annotation=path.match(/\s+\[(input|output|temp)\]$/);
    if(annotation){type=annotation[1];path=path.slice(0,annotation.index);}
    const slash=path.lastIndexOf("/");
    return {filename:path.slice(slash+1),subfolder:slash<0?"":path.slice(0,slash),type};
}

function stamp(value) {
    let hash=2166136261;
    for(const char of value)hash=Math.imul(hash^char.charCodeAt(0),16777619);
    return (hash>>>0).toString(16);
}

export function imageViewURL(api,image,revision="") {
    const query=new URLSearchParams({filename:image.filename,subfolder:image.subfolder||"",type:image.type||"input"});
    if(revision)query.set("fontbox_preview",stamp(revision));
    return api.apiURL(`/view?${query}`);
}

const getLink=(graph,id)=>graph?.links?.get?.(id)??graph?.links?.[id];
const nodeClass=node=>node?.comfyClass||node?.type||"";

export function resolveBackground(node,app,api) {
    let graph=node.graph||app.graph||app.rootGraph;
    const input=node.inputs?.find(input=>input.name==="background");
    if(input?.link==null)return {key:"disconnected",connected:false,url:null};
    let link=getLink(graph,input.link),source,slot=0;
    const seen=new Set();
    for(let depth=0;depth<64&&link;depth++) {
        source=graph?.getNodeById?.(link.origin_id);slot=Number(link.origin_slot||0);
        if(!source||seen.has(source)){source=null;break;}seen.add(source);
        if(nodeClass(source)!=="Reroute")break;
        graph=source.graph||graph;link=getLink(graph,source.inputs?.[0]?.link);source=null;
    }
    if(!source)return {key:`pending-link:${input.link}`,connected:true,url:null};
    const sourceKey=`${source.id}:${slot}`;
    if(["LoadImage","LoadImageOutput"].includes(nodeClass(source))&&slot===0) {
        const widget=source.widgets?.find(widget=>widget.name==="image");
        const imageInput=source.inputs?.find(input=>input.name==="image");
        const descriptor=imageInput?.link==null?parseImageSelection(widget?.value,nodeClass(source)==="LoadImageOutput"?"output":"input"):null;
        if(descriptor) {
            const preview=source.imgs?.[0];
            const revision=JSON.stringify(descriptor)+String(preview?.dataset?.fileUrl||preview?.currentSrc||preview?.src||"");
            const key=`file:${sourceKey}:${revision}`;
            return {key,connected:true,kind:"file",url:imageViewURL(api,descriptor,revision)};
        }
        // Never show an old LoadImage preview while its current filename is empty.
        return {key:`pending-file:${sourceKey}`,connected:true,url:null};
    }
    // A generic preview only identifies IMAGE output 0. Never show an unrelated
    // preview for another output slot or trace through image-processing nodes.
    if(slot===0) {
        const output=app.nodeOutputs?.[String(source.id)];
        const image=output?.images?.[0];
        if(image?.filename) {
            const descriptor=parseImageSelection(image,"output"),preview=source.imgs?.[0];
            const revision=JSON.stringify(descriptor)+String(preview?.dataset?.fileUrl||preview?.currentSrc||preview?.src||"");
            return {key:`cached:${sourceKey}:${revision}`,connected:true,kind:"preview",url:imageViewURL(api,descriptor,revision)};
        }
        const preview=source.imgs?.[0],url=preview?.dataset?.fileUrl||preview?.currentSrc||preview?.src;
        if(url)return {key:`preview:${sourceKey}:${url}`,connected:true,kind:"preview",url};
    }
    return {key:`pending:${sourceKey}`,connected:true,url:null};
}

export class BackgroundWatcher {
    constructor(node,editor,app,api,{schedule=setInterval,cancel=clearInterval,report=error=>console.warn("[FontBox] Background preview is not ready:",error)}={}) {
        Object.assign(this,{node,editor,app,api,schedule,cancel,report});this.lastKey=null;this.disposed=false;
    }
    reportOnce(error){const message=String(error?.message||error);if(message===this.lastError)return;this.lastError=message;try{this.report(error);}catch{}}
    refresh(force=false) {
        if(this.disposed)return this.current;
        let current;
        try{current=resolveBackground(this.node,this.app,this.api);}
        catch(error){this.reportOnce(error);return this.current;}
        this.current=current;
        if(!force&&current.key===this.lastKey)return current;
        this.lastKey=current.key;this.status=current.url?"loading":"empty";
        try{
            const loading=this.editor.setBackground(current.url);
            this.lastError=null;
            Promise.resolve(loading).then(loaded=>{
                if(!this.disposed&&this.lastKey===current.key)this.status=current.url?(loaded?"ready":"error"):"empty";
            }).catch(error=>{if(!this.disposed&&this.lastKey===current.key){this.status="error";this.reportOnce(error);}});
            if(current.connected&&!current.url)this.editor.notify("Background connected. Its upstream image must be available before it can be displayed.");
        }catch(error){this.status="error";this.lastKey=null;this.reportOnce(error);}
        return current;
    }
    get ownsBackground(){return !!this.current?.url&&this.status!=="error";}
    start(){if(this.disposed||this.timer!==undefined)return;try{this.timer=this.schedule(()=>this.refresh(),200);this.refresh();}catch(error){this.reportOnce(error);}}
    stop(){this.disposed=true;if(this.timer!==undefined)this.cancel(this.timer);}
}
