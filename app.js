document.querySelectorAll('[data-page]').forEach(button=>button.addEventListener('click',()=>{
 document.querySelectorAll('.page').forEach(page=>page.hidden=page.id!==button.dataset.page);
 document.querySelectorAll('[data-page]').forEach(item=>item.classList.toggle('selected',item===button));
}));

