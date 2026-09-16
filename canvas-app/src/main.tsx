import React from 'react';
import {createRoot} from 'react-dom/client';
import {CanvasWorkspace} from './CanvasWorkspace';
import {initialize} from './store';
import '@xyflow/react/dist/style.css';
import '../source.css';
import '../theme.css';
initialize().then(({canvases})=>createRoot(document.getElementById('root')!).render(<CanvasWorkspace user={{id:'local',name:'本地工作区',email:''}} initialCanvas={canvases[0]} initialCanvases={canvases.map((c:any)=>({...c,nodeCount:c.nodes.length,taskCount:0,coverUrl:null,coverType:null}))}/>)).catch(e=>{document.getElementById('root')!.textContent='画布读取失败：'+e.message});
