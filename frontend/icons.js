export const ICONS = {
    select:'<path d="m5 3 13 9-6 1-3 6z"/>', draw:'<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M12 8v8m-4-4h8"/>',
    plain:'<path d="M4 5h16M12 5v15m-4 0h8"/>', bold:'<path stroke-width="2.8" d="M7 4h6a4 4 0 0 1 0 8H7m0 0h7a4 4 0 0 1 0 8H7V4"/>',
    italic:'<path stroke-width="2.2" d="M10 4h9M5 20h9M15 4 9 20"/>',
    labels:'<path d="m3 3 18 18M10 5a11 11 0 0 1 11 7 16 16 0 0 1-4 5M6 6a15 15 0 0 0-5 6c2 5 7 8 12 7M10 10a3 3 0 0 0 4 4"/>',
    grip:'<path d="M8 5h.01M16 5h.01M8 12h.01M16 12h.01M8 19h.01M16 19h.01" stroke-width="3"/>',
    resetTaskbar:'<path d="M4 9a8 8 0 1 1 0 7M4 9V3m0 6h6"/>',
    move:'<path d="M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4m12-8 4 4-4 4"/>',
    change:'<path d="M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4"/>',
    left:'<path d="M4 4h16M4 9h10M4 14h16M4 19h10"/>', right:'<path d="M4 4h16M10 9h10M4 14h16M10 19h10"/>', center:'<path d="M4 4h16M7 9h10M4 14h16M7 19h10"/>',
    trash:'<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
    undo:'<path d="M4 10h10a6 6 0 0 1 0 12M4 10l5-5m-5 5 5 5"/>', redo:'<path d="M20 10H10a6 6 0 0 0 0 12m14-12-5-5m5 5-5 5"/>',
    download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>', upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
    expand:'<path d="M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5"/>'
    ,pan:'<path d="M8 12V5a2 2 0 0 1 4 0v7m0-6a2 2 0 0 1 4 0v6m0-4a2 2 0 0 1 4 0v7c0 4-3 7-7 7h-1c-2 0-4-2-5-4l-4-6a2 2 0 0 1 3-2l2 2"/>'
    ,zoomIn:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6m-3-3v6"/>'
    ,zoomOut:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6"/>'
    ,fit:'<path d="M3 8V3h5m8 0h5v5M3 16v5h5m8 0h5v-5M8 8h8v8H8z"/>'
    ,menu:'<path d="M4 6h16M4 12h16M4 18h16"/>'
};

Object.assign(ICONS,{
 size:'<path d="M4 9V4h5M4 4l6 6m10 5v5h-5m5 0-6-6M4 15v5h5m6-16h5v5"/>',
 vertical:'<path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/>',
 tracking:'<path d="m8 14 4-11 4 11M10 10h4M3 20h18M6 17l-3 3 3 3m12-6 3 3-3 3"/>',
 snap:'<path d="M5 3v9a7 7 0 0 0 14 0V3h-4v9a3 3 0 0 1-6 0V3zM5 7h4m6 0h4"/>',
 cloneBox:'<rect x="8" y="8" width="13" height="13" rx="1"/><path d="M16 8V3H3v13h5"/>',
 clearBoxes:'<path d="M3 15V3h12M8 8h13v13H8zM12 12l5 5m0-5-5 5"/>',
 addPrompt:'<path d="M4 4h16v12H9l-5 4zM8 10h8m-4-4v8"/>',
 keep:'<path d="m4 12 5 5L20 5"/>',new:'<path d="M12 4v16M4 12h16"/>',remove:'<path d="M4 12h16"/>',
 source:'<path d="M4 4h10v16H4zM9 12h12m-4-4 4 4-4 4"/>',target:'<path d="M10 4h10v16H10zM2 12h12m-4-4 4 4-4 4"/>',
 chevron:'<path d="m7 10 5 5 5-5"/>'
});
export const svg=(name,cls='')=>`<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]||ICONS.plain}</svg>`;
