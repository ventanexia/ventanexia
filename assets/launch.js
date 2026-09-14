
document.addEventListener("DOMContentLoaded",()=>{
  const btn=document.getElementById("mobileMenuBtn");
  const nav=document.getElementById("mainNav");
  if(btn&&nav){
    btn.addEventListener("click",()=>nav.classList.toggle("open"));
    nav.querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>nav.classList.remove("open")));
  }
  document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener("click",e=>{
    const id=a.getAttribute("href");
    const el=id&&id!=="#"?document.querySelector(id):null;
    if(el){e.preventDefault();el.scrollIntoView({behavior:"smooth",block:"start"})}
  }));
});
