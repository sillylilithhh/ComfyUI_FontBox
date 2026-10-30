import { clamp } from "./model.js";

/** All geometry is in viewport-local CSS pixels, independent of graph zoom. */
export function placeTaskbar(box, width, height, barWidth, barHeight, margin=8, gap=8) {
    if(width<=0||height<=0||box.right<=0||box.bottom<=0||box.left>=width||box.top>=height)
        return {visible:false};
    const above=box.top-gap-barHeight,below=box.bottom+gap;
    let top,side;
    if(above>=margin){top=above;side="above";}
    else if(below+barHeight<=height-margin){top=below;side="below";}
    else {
        // If neither outside edge fits, dock inside the viewport at the roomier edge.
        const aboveSpace=clamp(box.top,0,height)-margin;
        const belowSpace=height-margin-clamp(box.bottom,0,height);
        side=aboveSpace>=belowSpace?"above":"below";
        top=side==="above"?above:below;
    }
    return {visible:true,side,
        left:clamp((box.left+box.right-barWidth)/2,margin,Math.max(margin,width-barWidth-margin)),
        top:clamp(top,margin,Math.max(margin,height-barHeight-margin))};
}
