import test from 'node:test';import assert from 'node:assert/strict';
import {resourceActions} from '../../src/modules/aegis/custody.ts';
test('officer cannot approve or cancel an expected visitor',()=>{assert.deepEqual(resourceActions('visitor','expected',false),[]);assert.deepEqual(resourceActions('visitor','expected',true),['approved','cancelled']);assert.deepEqual(resourceActions('visitor','approved',false),['onsite'])});
test('custody return is distinct from supervisor loss and maintenance decisions',()=>{assert.deepEqual(resourceActions('key','issued',false),['returned']);assert.deepEqual(resourceActions('equipment','issued',true),['returned','lost']);assert.deepEqual(resourceActions('key','maintenance',false),[])});
test('completed visits and lost assets have no automatic reopening',()=>{assert.deepEqual(resourceActions('visitor','departed',true),[]);assert.deepEqual(resourceActions('equipment','lost',true),[])});
