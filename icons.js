// Original inline SVG line icons; no external fonts, assets or requests.
const paths={
 canvas:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 9v12"/>',
 tasks:'<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M9 7h.01M12 7h4M9 12h.01M12 12h4M9 17h.01M12 17h4"/>',
 settings:'<path d="m7 3-5 9 5 9h10l5-9-5-9Z"/><circle cx="12" cy="12" r="3"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
 brand:'<path d="m4 9 15-5 2 5-16 5Zm1 5v7h16V9M7 8l4 4M13 6l4 4"/><path d="m11 15 5 2-5 2Z"/>',
 select:'<path d="m5 3 14 10-7 1-3 7Z"/>',
 move:'<path d="M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3"/>',
 text:'<path d="M4 6V3h16v3M12 3v18M8 21h8"/>',
 image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
 video:'<rect x="2" y="4" width="20" height="16" rx="3"/><path d="m10 8 6 4-6 4Z"/>',
 link:'<circle cx="4" cy="18" r="2"/><circle cx="20" cy="6" r="2"/><path d="M6 18h2c6 0 2-12 8-12h2"/>',
 fit:'<path d="M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6"/>'
};
function icon(selector,name){document.querySelectorAll(selector).forEach(el=>{el.innerHTML='<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[name]+'</svg>'})}
icon('[data-page="canvas"]','canvas');icon('[data-page="tasks"],.empty-symbol','tasks');icon('[data-page="settings"]','settings');icon('aside .brandmark','brand');
[['选择','select'],['移动','move'],['文字','text'],['图片','image'],['连线','link'],['适应画布','fit']].forEach(([title,name])=>icon('[title="'+title+'"]',name));
icon('.story-node .node-icon','text');icon('.image-node .node-icon,.image-placeholder>span','image');icon('.video-node .node-icon,.video-placeholder>span','video');icon('[data-page="video-studio"]','video');
