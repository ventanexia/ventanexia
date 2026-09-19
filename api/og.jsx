import React from 'react';
import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

const tile = (icon, title, text, accent='#1686c9') =>
  React.createElement('div', {
    style: {
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      width:148, height:118, border:'2px solid '+accent, borderRadius:18,
      background:'rgba(4,28,52,.86)', color:'white', textAlign:'center', padding:'10px 8px'
    }
  },
    React.createElement('div',{style:{fontSize:30,marginBottom:6}},icon),
    React.createElement('div',{style:{fontSize:17,fontWeight:800,lineHeight:1.05}},title),
    React.createElement('div',{style:{fontSize:10,color:'#a9c8dd',marginTop:5,lineHeight:1.25}},text)
  );

export default function handler() {
  return new ImageResponse(
    React.createElement('div', {
      style:{
        width:'1200px', height:'630px', display:'flex', alignItems:'stretch',
        background:'radial-gradient(circle at 80% 20%, #0f62a6 0%, #061f39 34%, #031322 72%)',
        color:'white', fontFamily:'Arial, Helvetica, sans-serif', padding:'42px 42px 38px'
      }
    },
      React.createElement('div',{style:{width:'46%',display:'flex',flexDirection:'column',justifyContent:'center',paddingRight:30}},
        React.createElement('div',{style:{display:'flex',alignItems:'center',gap:16,marginBottom:28}},
          React.createElement('div',{style:{width:82,height:82,borderRadius:22,border:'3px solid #28d7ff',background:'linear-gradient(135deg,#071d35,#6d36ff)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:42,fontWeight:900,color:'#6fe8ff'}},'V'),
          React.createElement('div',{style:{fontSize:44,fontWeight:900,background:'linear-gradient(90deg,#50e1ff,#9f48ff)',backgroundClip:'text',color:'transparent'}},'VentaNexIA')
        ),
        React.createElement('div',{style:{fontSize:58,fontWeight:900,lineHeight:1.0,letterSpacing:-2,marginBottom:22}},'Agentes de IA para trabajar en tu empresa'),
        React.createElement('div',{style:{fontSize:24,lineHeight:1.35,color:'#d6e7f3',marginBottom:30}},'Captación, email, WhatsApp, ventas y clientes, marketing y más.'),
        React.createElement('div',{style:{display:'flex',gap:18,fontSize:16,fontWeight:700,color:'#f0f8ff'}},
          React.createElement('span',null,'✓ Fácil de usar'),
          React.createElement('span',null,'✓ Sin palabras técnicas'),
          React.createElement('span',null,'✓ Tú mantienes el control')
        )
      ),
      React.createElement('div',{style:{width:'54%',display:'flex',alignItems:'center',justifyContent:'center'}},
        React.createElement('div',{style:{width:635,height:500,border:'2px solid #3ea8e7',borderRadius:26,background:'#04182b',boxShadow:'0 25px 70px rgba(0,0,0,.5)',display:'flex',overflow:'hidden'}},
          React.createElement('div',{style:{width:132,background:'#041426',borderRight:'1px solid #1d5d80',padding:'18px 12px',display:'flex',flexDirection:'column'}},
            React.createElement('div',{style:{fontSize:14,fontWeight:800,marginBottom:18}},'VentaNexIA'),
            ...['Inicio','Dime qué necesitas','Conexiones','Alta de cliente','Web y tienda','Permisos','Archivos','Licencia y equipos','Ayuda','Actividad','Centro Maestro'].map((x,i)=>
              React.createElement('div',{key:x,style:{fontSize:10,color:i===1?'white':'#93afc2',background:i===1?'#0b69c2':'transparent',borderRadius:8,padding:'8px 7px',marginBottom:4}},x)
            ),
            React.createElement('div',{style:{marginTop:'auto',fontSize:9,color:'#56e0a0'}},'● Protección activa')
          ),
          React.createElement('div',{style:{flex:1,padding:'20px 18px',background:'radial-gradient(circle at 70% 0,#0a3b67 0,#04182b 55%)',display:'flex',flexDirection:'column'}},
            React.createElement('div',{style:{fontSize:10,color:'#38d8ff',fontWeight:900,letterSpacing:2}},'DIME QUÉ NECESITAS'),
            React.createElement('div',{style:{fontSize:29,fontWeight:900,marginTop:5}},'¿Qué necesitas hacer?'),
            React.createElement('div',{style:{fontSize:12,color:'#a9c8dd',marginTop:3,marginBottom:16}},'Elige un especialista y empieza a trabajar.'),
            React.createElement('div',{style:{display:'flex',flexWrap:'wrap',gap:10}},
              tile('🧠','Asistente IA','ideas, textos y tareas'),
              tile('✉️','Email y bandeja','leer, responder y borradores','#21d1ff'),
              tile('🟢','WhatsApp','responder clientes y pedir datos','#20b15a'),
              tile('🎯','Captación','buscar empresas y oportunidades'),
              tile('🤝','Ventas y clientes','seguimiento y cierre'),
              tile('🎧','Atención al cliente','dudas e incidencias'),
              tile('📄','Presupuestos','ofertas y propuestas'),
              tile('📣','Marketing y redes','contenidos y campañas')
            )
          )
        )
      )
    ),
    { width: 1200, height: 630 }
  );
}
