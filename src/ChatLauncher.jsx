import React,{useState} from 'react';
import {Sparkles} from 'lucide-react';
import {useCart} from './Cart.jsx';
import './chatbot.css';

const Chatbot=React.lazy(()=>import('./Chatbot.jsx'));

export default function ChatLauncher({onOpen,...props}) {
  const cart=useCart();
  const [loaded,setLoaded]=useState(false);
  const caption=props.lang==='ar'?'اسألي سباركل':'Ask Sparkle';
  const trigger=cart.open ? null : <aside className="sparkle-chat"><button className="chat-launcher" type="button"
    aria-label={caption} aria-expanded={false} aria-busy={loaded} onClick={()=>{onOpen();setLoaded(true);}}>
    <Sparkles size={24} strokeWidth={2} aria-hidden="true"/><span>{caption}</span>
  </button></aside>;
  return loaded ? <React.Suspense fallback={trigger}><Chatbot {...props} initialOpen/></React.Suspense> : trigger;
}
