import React from 'react';
export function Link({children,href,...props}:any){return <a {...props} href="#" onClick={e=>e.preventDefault()}>{children}</a>}
