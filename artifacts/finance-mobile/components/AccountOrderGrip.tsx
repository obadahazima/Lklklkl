import React,{useRef} from 'react';
import {PanResponder,View} from 'react-native';
import {Feather} from '@expo/vector-icons';
export function AccountOrderGrip({disabled,color,onStart,onMove,onEnd,onCancel,onStep,ar=true}:{disabled:boolean;color:string;onStart:()=>void;onMove:(dy:number)=>void;onEnd:()=>void;onCancel:()=>void;onStep:(delta:number)=>void;ar?:boolean}){
 const actions=useRef({disabled,onStart,onMove,onEnd,onCancel});actions.current={disabled,onStart,onMove,onEnd,onCancel};
 const pan=useRef(PanResponder.create({onStartShouldSetPanResponder:()=>!actions.current.disabled,onMoveShouldSetPanResponder:()=>!actions.current.disabled,onPanResponderGrant:()=>actions.current.onStart(),onPanResponderMove:(_,g)=>actions.current.onMove(g.dy),onPanResponderRelease:()=>actions.current.onEnd(),onPanResponderTerminate:()=>actions.current.onCancel(),onPanResponderTerminationRequest:()=>false})).current;
 return <View {...pan.panHandlers} accessible accessibilityRole="adjustable" accessibilityState={{disabled}} accessibilityLabel={ar?"اسحب لترتيب الحساب":"Drag to reorder account"} accessibilityActions={[{name:"increment",label:ar?"نقل للأسفل":"Move down"},{name:"decrement",label:ar?"نقل للأعلى":"Move up"}]} onAccessibilityAction={e=>{if(!disabled)onStep(e.nativeEvent.actionName === "increment"?1:-1);}} style={{padding:12,opacity:disabled?0.4:1}}><Feather name="menu" size={20} color={color}/></View>;
}
