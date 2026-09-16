import React from 'react';
export function VideoModelSelect({models,value,onChange,disabled,placeholder='生成服务尚未连接'}:any){return <select value={value} disabled={disabled||!models.length} onChange={e=>onChange(e.target.value)}><option value="">{placeholder}</option>{models.map((m:any)=><option key={m.id} value={m.id}>{m.label}</option>)}</select>}
