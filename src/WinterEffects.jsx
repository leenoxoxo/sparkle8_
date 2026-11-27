import React,{useEffect,useState} from 'react';
import {winterIsActive} from './seasonal-settings.js';
import './winter-effects.css';
import './winter-theme.css';

const density={low:[24,8],medium:[34,10],high:[40,14]};
const speeds={slow:1.35,normal:1,fast:.76};

function particles(count,type,speed) {
  return Array.from({length:count},(_,index)=>{
    const falling=type==='snow';
    const crystal=falling&&index%3===0;
    const foreground=crystal&&index%4!==0;
    const direction=index%2?-1:1;
    const duration=(falling?(foreground?15:24)+index*7%14:3.5+index*3%7)*speed;
    const phase=(.12+index*.61803398875)%1;
    const size=falling?(crystal?(foreground?17+index%8:11+index%6):6+index%6):10+index*5%10;
    const tone=index%5===0?'pink':index%3===0?'silver':'white';
    return <i key={index} className={'winter-particle winter-'+type} data-tone={tone} data-shape={crystal?'crystal':falling?'round':'star'}
      data-glow={foreground||(!falling&&index%3===0)||undefined} style={{
        '--x':(2+index*37%96)+'%','--y':(6+index*19%88)+'%',
        '--size':size+'px','--alpha':.56+(index*5%7)*.052,
        '--drift':direction*(18+index*11%38)+'px',
        '--spin':direction*(36+index*13%62)+'deg',
        '--duration':duration+'s','--delay':-(duration*phase)+'s',
    }}>{crystal?'❄︎':falling?'':'✧'}</i>;
  });
}

export default function WinterEffects({settings,preview=false,animate=true}){
  const [hidden,setHidden]=useState(()=>document.hidden);
  const [now,setNow]=useState(()=>new Date());
  const scheduled=!preview&&(settings.startDate||settings.endDate);
  useEffect(()=>{
    const visibility=()=>{
      setHidden(document.hidden);
      if(!document.hidden&&scheduled)setNow(new Date());
    };
    document.addEventListener('visibilitychange',visibility);
    const timer=scheduled&&!hidden?setInterval(()=>setNow(new Date()),60000):null;
    return ()=>{
      document.removeEventListener('visibilitychange',visibility);
      if(timer)clearInterval(timer);
    };
  },[scheduled,hidden]);
  if(!preview&&!winterIsActive(settings,now))return null;
  const speed=speeds[settings.speed]??1;
  const [snowCount,sparkleCount]=density[settings.intensity]??density.medium;
  return <>
    {!preview&&<span className="winter-theme-active" hidden/>}
    {animate&&<div aria-hidden="true" className={'winter-layer '+(preview?'winter-layer--preview':'winter-layer--site')}
    data-paused={hidden} data-frost={settings.frost||undefined}>
    {settings.snow&&<div className="winter-snowfall">{particles(snowCount,'snow',speed)}</div>}
    {settings.sparkles&&<div className="winter-sparkles">{particles(sparkleCount,'sparkle',speed)}</div>}
    </div>}
  </>;
}
