import React, {useId,useRef,useState} from 'react';
import {Check,ChevronDown} from 'lucide-react';

export default function KitPiecePicker({label,placeholder,choices,value,translate,onChange}){
  const [open,setOpen]=useState(false);
  const trigger=useRef(null);
  const id=useId();
  function close(){
    setOpen(false);
    trigger.current.focus();
  }
  return <div className="kit-picker" data-option-missing={!value||undefined}
    onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}}
    onKeyDown={event=>{if(open&&event.key==='Escape'){event.stopPropagation();close();}}}>
    <span id={id+'-label'} className="kit-picker-label">{label}</span>
    <button ref={trigger} className="kit-picker-trigger" type="button" aria-expanded={open}
      aria-controls={id+'-choices'} aria-labelledby={id+'-label '+id+'-value'} onClick={()=>setOpen(!open)}>
      <span id={id+'-value'}>{value?translate(value):placeholder}</span><ChevronDown size={18} aria-hidden="true"/>
    </button>
    <ul id={id+'-choices'} className="kit-picker-choices" hidden={!open}>
      {choices.map(choice=><li key={choice}><button type="button" aria-pressed={choice===value}
        onClick={()=>{onChange(choice);close();}}>
        {translate(choice)}{choice===value&&<Check size={17} aria-hidden="true"/>}
      </button></li>)}
    </ul>
  </div>;
}
