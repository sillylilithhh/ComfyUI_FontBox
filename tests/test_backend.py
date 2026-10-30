"""FLUX prompt contracts, extra-instruction ordering and state compatibility."""
import copy
import importlib.util
import json
import pathlib
import sys
import types
import unittest
from unittest.mock import patch
import torch
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('lora_bbox_test_package',ROOT/'__init__.py',submodule_search_locations=[str(ROOT)])
package=importlib.util.module_from_spec(spec);sys.modules[spec.name]=package;spec.loader.exec_module(package)
from lora_bbox_test_package.model import parse_state,elements,instruction,complete_prompt,prompt,PRESERVE,incoming_boxes,resolve_state,outputs
from lora_bbox_test_package.nodes import FontBox,FontBoxFitBoxAspect


def state(**kw):
    b=dict(id='a',x=.25,y=.125,w=.5,h=.5,content='Hello',mode='plain');b.update(kw)
    return parse_state({'boxes':[b]})


class BackendTests(unittest.TestCase):
    def test_node_and_versioned_bundle(self):
        self.assertIs(package.NODE_CLASS_MAPPINGS['LoRABoundingBoxEditor'],FontBox)
        self.assertEqual([p.name for p in (ROOT/package.WEB_DIRECTORY).glob('*.js')],[f'fontbox-{package.VERSION}.js'])
        self.assertEqual(FontBox.RETURN_NAMES,('elements','bbox','mask','preview','prompt','instruction','elements_json'))

    def test_extra_is_raw_ordered_per_box_and_never_in_desc(self):
        s=state(mode='change',source='Before',replacement='After',align='right',extra_instruction='Use condensed letters.\nDo not add a shadow!')
        second=state(id='b',content='Second')['boxes'][0];s['boxes'].append(second);s=parse_state(s)
        text=instruction(s['boxes']);first=s['boxes'][0];self.assertTrue(text.startswith(prompt(first)+' '+first['extra_instruction']+' '+prompt(s['boxes'][1])))
        self.assertTrue(text.endswith(PRESERVE));rows=elements(s['boxes']);self.assertEqual(rows[0]['desc'],'After');self.assertNotIn('condensed',json.dumps(rows))
        full=complete_prompt(text,rows);prefix,table=full.split(' [{"id":',1);self.assertTrue(prefix.endswith(PRESERVE));self.assertEqual(json.loads('[{"id":'+table),rows)
        self.assertEqual(full.count(PRESERVE),1)

    def test_extra_survives_workflow_queue_and_empty_legacy_defaults(self):
        s=state(extra_instruction='Café "日本語"\nKeep it crisp.');restored=parse_state(json.dumps(s));self.assertEqual(restored,s)
        result=FontBox().execute(128,128,s);self.assertIn('Café',result['result'][4]);self.assertEqual(result['ui']['lora_bbox_state'][0]['boxes'][0]['extra_instruction'],s['boxes'][0]['extra_instruction'])
        self.assertEqual(parse_state({'version':1,'boxes':[{'x':.1,'y':.1,'w':.1,'h':.1}]})['boxes'][0]['extra_instruction'],'')

    def test_exact_change_instruction_and_rows(self):
        s=state(x=.014,y=.899,w=.982,h=.083,mode='change',source='PERSONA5',replacement='2Mello',align='right')
        self.assertEqual(prompt(s['boxes'][0]),'In <ref_image_0>, change the text "PERSONA5" <obj_2> to "2Mello" and right align it, and maintain the exact font typographic style, character spacing, colors, and style.')
        rows=elements(s['boxes']);self.assertEqual(rows[0],{'id':'obj_2','from':None,'src_bbox':None,'tgt_bbox':[899,14,982,996],'desc':'2Mello'})
        self.assertEqual(rows[-1]['id'],'obj_1');self.assertEqual(rows[-1]['src_bbox'],[0,0,1000,1000]);self.assertEqual(rows[-1]['tgt_bbox'],[0,0,1000,1000])

    def test_ids_compact_and_remap_additional_instruction_tags_only(self):
        s=state(object_id='obj_40',content='Literal <obj_80>',extra_instruction='Follow <obj_80>.')
        # Restore a genuinely sparse saved layout as it would arrive from an older release.
        s=parse_state({'next_object_id':900,'boxes':[{'id':'a','object_id':'obj_40','x':.1,'y':.1,'w':.1,'h':.1,'content':'Literal <obj_80>','extra_instruction':'Follow <obj_80>.'},
            {'id':'b','object_id':'obj_80','x':.4,'y':.4,'w':.1,'h':.1,'content':'B'}]})
        self.assertEqual([b['object_id'] for b in s['boxes']],['obj_2','obj_3']);self.assertEqual(s['boxes'][0]['extra_instruction'],'Follow <obj_3>.');self.assertEqual(s['boxes'][0]['content'],'Literal <obj_80>')
        s['boxes']=[];self.assertEqual(parse_state(s)['next_object_id'],2)

    def test_keep_new_remove_move_masks_and_hidden_anchor(self):
        s=parse_state({'boxes':[{'id':'m','x':.6,'y':.2,'w':.2,'h':.1,'action':'move','mode':'move','content':'Word','src':{'x':.1,'y':.2,'w':.2,'h':.1}},
            {'id':'k','x':0,'y':0,'w':1,'h':1,'action':'keep','content':'Art'}]})
        rows,boxes,mask,preview,*_=FontBox().execute(100,100,s)['result'];self.assertEqual(mask.sum().item(),400);self.assertEqual(mask[0,0,0].item(),0);self.assertEqual(len(boxes[0]),2)
        self.assertEqual(rows[0]['src_bbox'],[200,100,300,300]);self.assertEqual(rows[0]['tgt_bbox'],[200,600,300,800]);self.assertEqual(rows[1]['src_bbox'],rows[1]['tgt_bbox'])
        removed=FontBox().execute(64,64,state(action='remove'))['result'];self.assertIsNone(removed[0][0]['tgt_bbox']);self.assertGreater(removed[2].sum().item(),0)
        empty=FontBox().execute(64,64)['result'];self.assertEqual(len(empty[0]),1);self.assertEqual(empty[1],[]);self.assertEqual(empty[2].sum().item(),0)

    def test_row_and_native_roundtrip_pairing(self):
        s=state(action='move',mode='move',src={'x':.1,'y':.2,'w':.2,'h':.1});rows,pixels=outputs(s['boxes'],200,100)
        for value in (rows,json.dumps(rows),pixels):
            restored=parse_state({'boxes':incoming_boxes(value,200,100)});self.assertEqual(len(restored['boxes']),1);self.assertEqual(elements(restored['boxes']),rows)

    def test_legacy_prompts_and_full_backdrop_migrate(self):
        for mode,desc in [('change','Change "old" to "new". Right align.'),('italic','Italicize Hello.'),('italic','Italicize "Hello".'),('tracking','Adjust tracking of "Hello".'),('size','Adjust the size of "Hello".')]:
            b=incoming_boxes([{'bbox':[0,0,500,500],'desc':desc}],100,100)[0];self.assertEqual(b['mode'],mode);self.assertEqual(b.get('replacement') if mode=='change' else b['content'],'new' if mode=='change' else 'Hello')
        self.assertEqual(parse_state({'version':1,'boxes':[{'x':0,'y':0,'w':1,'h':1,'content':'backdrop.'}]})['boxes'],[])

    def test_incoming_clear_and_guides_preserved(self):
        incoming=[{'bbox':[0,0,500,500],'desc':'Incoming'}];s=resolve_state(None,incoming,100,100);s['boxes'][0]['content']='Edited';s['boxes'][0]['extra_instruction']='Preserve grain.';s['guides']=[{'id':'g','axis':'x','position':.4}]
        same=resolve_state(s,incoming,100,100);self.assertEqual(same['boxes'][0]['content'],'Edited');self.assertEqual(same['boxes'][0]['extra_instruction'],'Preserve grain.')
        same['boxes']=[];cleared=resolve_state(same,incoming,100,100);self.assertEqual(cleared['boxes'],[]);self.assertEqual(cleared['guides'],same['guides']);self.assertEqual(cleared['next_object_id'],2)

    def test_background_batch(self):
        class Preview:
            def save_images(self,images,prefix):return {'ui':{'images':[{'filename':'test.png','type':'temp'}]}}
        with patch.dict(sys.modules,{'nodes':types.SimpleNamespace(PreviewImage=Preview)}):
            r=FontBox().execute(editor_state=state(),background=torch.zeros((2,80,200,3)))
        self.assertEqual(r['result'][2].shape,(2,80,200));self.assertEqual(r['result'][3].shape,(2,80,200,3));self.assertEqual(r['ui']['lora_bbox_dims'],[200,80])

    def test_guide_editing_does_not_change_outputs(self):
        s=state();g=copy.deepcopy(s);g['guides']=[{'id':'g','axis':'y','position':.3}]
        a,b=FontBox().execute(64,64,s)['result'],FontBox().execute(64,64,g)['result'];self.assertEqual(a[:2],b[:2]);self.assertTrue(torch.equal(a[2],b[2]));self.assertTrue(torch.equal(a[3],b[3]));self.assertEqual(a[4:],b[4:])

    def test_aspect_preserves_sources_anchor_and_extra_instruction(self):
        s=state(mode='move',action='move',src={'x':.1,'y':.2,'w':.2,'h':.1},extra_instruction='Preserve the original baseline.');rows=elements(s['boxes'])
        r=FontBoxFitBoxAspect().execute(rows,torch.zeros((1,128,1024,3)),1000,1000,instruction=instruction(s['boxes']))
        self.assertEqual(r[0][0]['src_bbox'],rows[0]['src_bbox']);self.assertNotEqual(r[0][0]['tgt_bbox'],rows[0]['tgt_bbox']);self.assertEqual(r[0][-1],rows[-1]);self.assertIn('Preserve the original baseline.',r[5]);self.assertEqual(r[5].count(PRESERVE),1)

    def test_validation_and_typography_alignment(self):
        for bad in ['bad',42,[{'bbox':[0,1]}],[{'bbox':[0,0,float('nan'),1]}],[{'id':'x','from':None,'src_bbox':[0,0,1,1],'tgt_bbox':None}]]:
            with self.assertRaises(ValueError):incoming_boxes(bad,100,100)
        for mode in ('bold','italic','move','size','vertical','tracking'):
            b=state(mode=mode,align='right')['boxes'][0];self.assertIsNone(b['align']);self.assertNotIn('right align',prompt(b))
