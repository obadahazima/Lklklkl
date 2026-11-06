import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(path,deps={}) {const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:id=>{if(id in deps)return deps[id];throw Error(id);}});return exports;}
const utils=load('lib/api-client-react/src/voice-utils.ts');
const credit=load('lib/api-client-react/src/account-credit.ts',{'./voice-utils':utils});
const server=load('artifacts/api-server/src/lib/account-credit.ts',{'@workspace/db':{},'drizzle-orm':{}});
test('credit debt accepts unsigned and signed Arabic input and applies minus exactly once',()=>{
 for(const value of ['500','-500','−500','٥٠٠','-٥٠٠','  - ٥٠٠ '])assert.equal(credit.openingAccountBalance('credit',value),-500);
 assert.equal(credit.openingAccountBalance('credit',''),0);
 assert.equal(credit.openingAccountBalance('cash','500'),500);
 assert.equal(credit.openingAccountBalance('debit','-٥٠٠'),-500);
 for(const value of ['--500','5oops','12.555','10000000000000'])assert.ok(Number.isNaN(credit.openingAccountBalance('credit',value)));
});
test('optional limit accepts localized decimals, rejects negatives and stays separate from debt',()=>{
 assert.equal(credit.optionalCreditLimit(''),null);
 assert.equal(credit.optionalCreditLimit('٢٬٠٠٠٫٥٠'),2000.5);
 assert.equal(credit.optionalCreditLimit('0'),0);
 for(const value of ['-200','20.555','NaN'])assert.ok(Number.isNaN(credit.optionalCreditLimit(value)));
 assert.equal(credit.creditAvailability(-500,2000),1500);
 assert.equal(credit.creditAvailability(-300,2000),1700);
 assert.equal(credit.creditAvailability(-2500,2000),0);
 assert.equal(credit.creditAvailability(100,2000),2100);
});
test('API sign normalization agrees with client and preserves ordinary account signs',()=>{
 for(const value of [500,-500,0])assert.equal(server.creditOpeningBalance('credit',value),-Math.abs(value));
 assert.equal(server.creditOpeningBalance('cash',500),500);
 assert.equal(server.creditOpeningBalance('debit',-500),-500);
 for(const value of [NaN,Infinity,1e13,1.555])assert.equal(server.validAccountAmount(value),false);
 for(const value of [0,500,-500,12.55])assert.equal(server.validAccountAmount(value),true);
});
