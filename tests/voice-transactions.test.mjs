import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), "utf8");
const serverRequire = createRequire(new URL("artifacts/api-server/package.json", root));
const clientRequire = createRequire(new URL("lib/api-zod/package.json", root));
function loadSource(source, overrides = {}) {
  const exports = {};
  const context = { exports, require: (id) => id in overrides ? overrides[id] : serverRequire(id), Buffer, console, setTimeout, clearTimeout, setInterval, clearInterval, URL, process };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, context);
  return exports;
}
const voice = loadSource(read("artifacts/api-server/src/lib/voice-input.ts"));
const ui = loadSource(read("lib/api-client-react/src/voice-utils.ts"));

for (const [text, today, expected] of [
  ["قبل ٣ أيام", "2026-11-01", "2026-10-29"],
  ["قبل ۳ أيام", "2026-11-01", "2026-10-29"],
  ["قبل يومين", "2026-01-01", "2025-12-30"],
  ["مبارح", "2026-03-01", "2026-02-28"],
  ["أول امبارح", "2026-11-01", "2026-10-30"],
  ["بكرا", "2026-12-31", "2027-01-01"],
  ["last Monday", "2026-11-02", "2026-10-26"],
  ["next Monday", "2026-11-02", "2026-11-09"],
  ["الاثنين الماضي", "2026-11-02", "2026-10-26"],
  ["يوم الأحد", "2026-11-01", "2026-11-01"],
  ["الأسبوع الماضي", "2026-11-01", "2026-10-25"],
  ["بتاريخ 2026-10-05", "2026-11-01", "2026-10-05"],
  ["بتاريخ ١٥/٧", "2026-11-01", "2026-07-15"],
  ["July 15th", "2026-11-01", "2026-07-15"],
  ["February 31st", "2026-11-01", null],
  ["بتاريخ 31/2", "2026-11-01", null],
  ["دفعت 500", "2026-11-01", null],
]) test(`spoken date: ${text}`, () => assert.equal(voice.extractDateFallback(text, today), expected));

for (const [input, expected] of [["١٬٥٠٠٫٥٠",1500.5],["۱۲۰",120],["1,500.25",1500.25],["50.50",50.5],["50abc",NaN],["1,5",NaN],["Infinity",NaN],["",NaN]]) {
  test(`amount: ${input}`, () => assert.equal(ui.normalizeAmountInput(input), expected));
}
test("caller calendar date does not drift to the UTC day", () => {
  assert.equal(ui.localISODate({ getFullYear: () => 2026, getMonth: () => 10, getDate: () => 2 }), "2026-11-02");
});
test("voice source and destination ids reach the mobile form", () => {
  assert.equal(ui.voiceAccountSelection({ type: "transfer", accountId: 11, toAccountId: 22 }).accountId, "11");
  assert.equal(ui.voiceAccountSelection({ type: "transfer", accountId: 11, toAccountId: 22 }).toAccountId, "22");
  assert.equal(ui.voiceAccountSelection({ accountName: "Unknown account" }, [{id: 1}]).accountId, "");
});
test("ambiguous Ahmad is not silently linked to the model's chosen id", () => {
  const rows = [{id:1,name:"أحمد علي"},{id:2,name:"أحمد حسن"}];
  assert.equal(voice.resolveVoiceEntity(1,"احمد",rows).id,null);
  assert.equal(voice.resolveVoiceEntity(1,"أحمد علي",rows).id,1);
  assert.equal(voice.resolveVoiceEntity(99,"رشا",rows).id,null);
  assert.equal(voice.resolveVoiceEntity(3,"رشا",[{id:3,name:"Rasha"}]).id,3);
});
test("unrecognized currency and malformed/model-ambiguous drafts require clarification", () => {
  const base = {type:"expense",amount:500};
  assert.ok(voice.voiceDraftError(base,["AED"],"USD"));
  assert.ok(voice.voiceDraftError({...base,amount:"500"},["AED"],"AED"));
  assert.ok(voice.voiceDraftError({...base,amount:0},["AED"],"AED"));
  assert.ok(voice.voiceDraftError({...base,amount:Infinity},["AED"],"AED"));
  assert.ok(voice.voiceDraftError({...base,type:"other"},["AED"],"AED"));
  assert.equal(voice.voiceDraftError({...base,requiresClarification:true,clarificationQuestion:"أي مبلغ؟"},["AED"],"AED"),"أي مبلغ؟");
  assert.equal(voice.voiceDraftError(base,["AED"],"AED"),null);
});
test("transcription rejects invalid encodings/MIME and accepts real base64", () => {
  assert.equal(voice.validateVoiceAudio(Buffer.from("audio").toString("base64"),"audio/mp4"),null);
  assert.ok(voice.validateVoiceAudio("not base64!","audio/mp4"));
  assert.ok(voice.validateVoiceAudio("YWJj","text/html"));
  assert.ok(voice.validateVoiceAudio("A".repeat(voice.MAX_AUDIO_BASE64_LENGTH + 4),"audio/mp4"));
  assert.equal(voice.MAX_AUDIO_BASE64_LENGTH,ui.MAX_VOICE_BASE64_LENGTH);
});

// Execute the real component handlers, isolating only React state/network dependencies.
function handler(path, name, dependencies) {
  const source = read(path);
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node.getText(ast);
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) found = `const ${node.getText(ast)};`;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(found,`Production handler ${name} exists`);
  const context = vm.createContext({...dependencies});
  vm.runInContext(ts.transpileModule(`${found}\nglobalThis.handler = ${name};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  return context.handler;
}
const mobilePath = "artifacts/finance-mobile/app/(tabs)/transactions.tsx";
test("mobile applies AI accounts, amount, and settlement status", () => {
  let form={amount:"old",accountId:"",toAccountId:""};
  handler(mobilePath,"applyParsed",{TX_TYPES:["transfer"],setForm:f=>{form=f(form);},voiceAccountSelection:ui.voiceAccountSelection,accounts:[],localISODate:()=>"2026-11-01",parsedDateDetectedRef:{},parsedRef:{},resolveRef:{},setVoiceEditField:()=>{},advanceResolutionChain:()=>{}})({type:"transfer",amount:500,currency:"AED",accountId:11,toAccountId:22,status:"settled"});
  assert.equal(form.accountId,"11");assert.equal(form.toAccountId,"22");assert.equal(form.status,"settled");
});
test("failed/invalid mobile save leaves review open; success closes afterwards", async () => {
  for(const saved of [false,true]) {
    const events=[];
    await handler(mobilePath,"handleVoiceConfirmSave",{form:{amount:"500"},handleCreate:async()=>{events.push("save");return saved;},voiceSheetFlowRef:{current:true},setVoiceSheetVisible:v=>events.push(v)} )();
    assert.deepEqual(events,saved?["save",false]:["save"]);
  }
});
test("mobile does not queue twice while a local save is in flight", async () => {
  let calls=0,release;
  const pending=new Promise(resolve=>{release=resolve;});
  const save=handler(mobilePath,"handleCreate",{form:{amount:"١٬٥٠٠٫٥٠",type:"expense",currency:"AED",accountId:"11",date:"2026-11-01",status:"settled"},draft:{ready:true,id:"draft-1",restore:()=>{}},userId:"user-1",settings:{currencies:["AED"]},transactionError:()=>null,manualErrorMessage:()=>"error",saveInFlightRef:{current:false},normalizeAmountInput:ui.normalizeAmountInput,Alert:{alert:()=>{}},language:"ar",mobileLedger:{enqueue:async(_owner,data)=>{calls++;assert.equal(data.amount,1500.5);await pending;},uuid:()=>"draft-2",saveDraft:async()=>{}},setSavingLocal:()=>{},saveAnotherRef:{current:false},localISODate:()=>"2026-11-01",Haptics:{notificationAsync:()=>Promise.resolve(),NotificationFeedbackType:{Success:1}},setShowModal:()=>{}});
  const first=save();assert.equal(await save(),false);release();assert.equal(await first,true);assert.equal(calls,1);
});
test("website keeps interim speech when stopping before final recognition", async () => {
  let recognition,heard;
  class Speech { constructor(){recognition=this;} start(){this.onstart();} }
  const toggle=handler("artifacts/finance-app/src/pages/new-transaction.tsx","toggleVoiceRecording",{recordingBusyRef:{current:false},isTranscribing:false,parseMutation:{isPending:false},isRecording:false,window:{SpeechRecognition:Speech},language:"ar",mountedRef:{current:true},setIsRecording:()=>{},setTextInput:()=>{},recognitionRef:{current:null},analyzeText:text=>{heard=text;},toast:()=>{}});
  await toggle();recognition.onresult({results:[Object.assign([{transcript:"دفعت 500 درهم"}],{isFinal:false})]});recognition.onend();
  assert.equal(heard,"دفعت 500 درهم");
});

test("actual HTTP pipeline accepts >1MiB voice, keeps ordinary requests small, authenticates first", async () => {
  const express=serverRequire("express");
  const router=express.Router();router.post("/ai/transcribe-voice",(_req,res)=>res.json({ok:true}));router.post("/small",(_req,res)=>res.json({ok:true}));
  const noOp=(_req,_res,next)=>next();
  const app=loadSource(read("artifacts/api-server/src/app.ts"),{
    "./routes":{default:router,__esModule:true},
    "./lib/logger":{logger:{}},"pino-http":{default:()=>noOp,__esModule:true},
    "@clerk/express":{clerkMiddleware:()=>noOp},"@clerk/shared/keys":{publishableKeyFromHost:()=>"test"},
    "./middlewares/clerkProxyMiddleware.js":{CLERK_PROXY_PATH:"/clerk-proxy",clerkProxyMiddleware:()=>noOp,getClerkProxyHost:()=>null},
    "./middlewares/requireAuth":{requireAuth:(req,res,next)=>req.headers.authorization?next():res.status(401).end()},
    "./lib/voice-input":voice,
  }).default;
  const server=app.listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));
  try {
    const url=`http://127.0.0.1:${server.address().port}`;
    const body=JSON.stringify({audioBase64:Buffer.alloc(800_000).toString("base64"),mimeType:"audio/mp4"});
    assert.equal((await fetch(url+"/api/ai/transcribe-voice",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer test"},body})).status,200);
    assert.equal((await fetch(url+"/api/small",{method:"POST",headers:{"Content-Type":"application/json"},body})).status,413);
    assert.equal((await fetch(url+"/api/ai/transcribe-voice",{method:"POST",headers:{"Content-Type":"application/json"},body})).status,401);
  } finally {await new Promise(resolve=>server.close(resolve));}
});
test("generated schema preserves caller date and parsed settlement status", () => {
  const generated=loadSource(read("lib/api-zod/src/generated/api.ts"),{zod:clientRequire("zod")});
  assert.equal(generated.ParseVoiceInputBody.parse({text:"دفعت 500",referenceDate:"2026-11-01"}).referenceDate,"2026-11-01");
  assert.equal(generated.ParseVoiceInputResponse.parse({success:true,status:"settled"}).status,"settled");
});

test("parse route validates model output and preserves caller dates and owned entities", async () => {
  const express = serverRequire("express");
  const generated = loadSource(read("lib/api-zod/src/generated/api.ts"), {zod:clientRequire("zod")});
  let modelOutput, modelConfig;
  const clientsTable={},tripsTable={},accountsTable={};
  const rows = new Map([[clientsTable,[{id:1,name:"أحمد علي"},{id:2,name:"أحمد حسن"}]],[tripsTable,[]],[accountsTable,[{id:11,name:"البنك",currency:"AED"},{id:22,name:"كاش",currency:"AED"}]]]);
  const noOp=(_req,_res,next)=>next();
  const router=loadSource(read("artifacts/api-server/src/routes/ai.ts"), {
    "express":express,
    "@workspace/db":{db:{select:()=>({from:table=>({where:async()=>rows.get(table)??[]})})},clientsTable,tripsTable,accountsTable},
    "@workspace/api-zod":generated,
    "@google/generative-ai":{...serverRequire("@google/generative-ai"),GoogleGenerativeAI:class {getGenerativeModel(config){modelConfig=config;return {generateContent:async()=>({response:{text:()=>JSON.stringify(modelOutput)}})};}}},
    "drizzle-orm":{eq:()=>{},and:()=>{}},
    "../lib/voice-input.js":voice,"../lib/aiQuota.js":{aiQuota:noOp},"../middlewares/requireAuth.js":{requireAuth:noOp},
    "../utils/overdue-clients.js":{},"../utils/exchange-rates.js":{},
  }).default;
  const route=router.stack.find(layer=>layer.route?.path==="/ai/parse-voice").route.stack.at(-1).handle;
  const oldKey=process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY="test-only-key";
  const call=async(output,text="قبضت 500 من أحمد مبارح")=>{
    modelOutput=output;
    let result;
    const res={status(){return this;},json(value){result=value;return this;}};
    await route({body:{text,currencies:["AED"],primaryCurrency:"AED",referenceDate:"2026-11-01"},userId:"test-user",log:{error(){},warn(){}}},res);
    return result;
  };
  try {
    const base={requiresClarification:false,type:"receipt",amount:500,currency:"AED",clientName:"احمد",clientId:1,accountName:"البنك",accountId:11,status:"settled",date:"2026-11-01"};
    let result=await call(base);
    assert.equal(result.success,true);assert.equal(result.date,"2026-10-31");assert.equal(result.clientId,null);assert.equal(result.clientName,"احمد");assert.equal(result.accountId,11);assert.equal(result.status,"settled");
    assert.equal(modelConfig.generationConfig.responseMimeType,"application/json");
    result=await call({...base,currency:"USD"});assert.equal(result.success,false);assert.match(result.error,/USD/);
    result=await call({...base,accountId:999,accountName:"حساب آخر"});assert.equal(result.success,false);
    result=await call({...base,amount:null});assert.equal(result.success,false);
    result=await call({...base,requiresClarification:true,clarificationQuestion:"سجّل كل معاملة لحالها"});assert.equal(result.success,false);
    result=await call({...base,toAccountId:22,toAccountName:"كاش"});assert.equal(result.toAccountId,null);
  } finally {if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey;}
});

function nativeRecorderHarness(transcribe, audioBytes = 300) {
  let cleanup, starts=0;
  const recorder={uri:"file://recording.m4a",prepareToRecordAsync:async()=>{},record:()=>{starts++;},stop:async()=>{}};
  const mockReact={useRef:value=>({current:value}),useState:value=>[value,()=>{}],useCallback:fn=>fn,useEffect:fn=>{cleanup=fn();}};
  const hook=loadSource(read("artifacts/finance-mobile/hooks/useVoiceRecording.ts"),{
    react:mockReact,"react-native":{Platform:{OS:"android"}},
    "expo-audio":{AudioModule:{requestRecordingPermissionsAsync:async()=>({granted:true})},RecordingPresets:{HIGH_QUALITY:{}},setAudioModeAsync:async()=>{},useAudioRecorder:()=>recorder},
    "expo-file-system/legacy":{getInfoAsync:async()=>({exists:true,size:audioBytes}),readAsStringAsync:async()=>"YWJj",EncodingType:{Base64:"base64"},deleteAsync:async()=>{}},
    "@workspace/api-client-react":{...ui,transcribeVoice:transcribe},
  }).useVoiceRecording("ar");
  return {hook,cleanup:()=>cleanup(),starts:()=>starts};
}
test("native recording prevents concurrent starts/stops and ignores cancelled upload results", async () => {
  let release,uploadStarted;
  const started=new Promise(resolve=>{uploadStarted=resolve;});
  const h=nativeRecorderHarness(async()=>{uploadStarted();return await new Promise(resolve=>{release=resolve;});});
  try {
    assert.equal(await h.hook.startRecording(),true);
    assert.equal(await h.hook.startRecording(),false);
    assert.equal(h.starts(),1);
    const pending=h.hook.stopAndTranscribe();
    assert.equal(await h.hook.stopAndTranscribe(),null);
    await started;
    await h.hook.cancelRecording();
    release({success:true,text:"دفعت 500"});
    assert.equal(await pending,null);
  } finally {h.cleanup();}
});
test("native transcription exposes the current error immediately and enforces audio size", async () => {
  for(const bytes of [300,14_000_000]) {
    let uploads=0;
    const h=nativeRecorderHarness(async()=>{uploads++;return {success:false};},bytes);
    try {
      await h.hook.startRecording();
      assert.equal(await h.hook.stopAndTranscribe(),null);
      assert.equal(h.hook.error,bytes===300?"transcribe_failed":"recording_too_long");
      assert.equal(uploads,bytes===300?1:0);
    } finally {h.cleanup();}
  }
});
