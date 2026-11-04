
const b=document.querySelector('.menu'), n=document.querySelector('.navlinks');
if(b&&n){b.addEventListener('click',()=>n.classList.toggle('open'))}
const q=document.querySelector('#site-search');
if(q){q.addEventListener('input',e=>{const s=e.target.value.toLowerCase();document.querySelectorAll('[data-search]').forEach(x=>x.style.display=x.dataset.search.includes(s)?'block':'none')})}
