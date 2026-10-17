import json, sys
import numpy as np
from PIL import Image
S = 0.75
names = {
 # player
 'player_down_sword':'b_0_0','player_up_sword':'b_0_1','player_side_sword':'b_0_2','player_side_attack':'b_0_3',
 'player_slash':'b_0_4','player_dash':'b_0_5',
 'player_down_0':'s_0_0','player_down_1':'s_0_1','player_down_2':'s_0_2','player_down_3':'s_0_3',
 'player_up_0':'s_0_4','player_up_1':'s_0_5','player_up_2':'s_0_6','player_up_3':'s_0_7',
 **{f'player_side_{i}':f's_1_{i}' for i in range(8)},
 'player_atk_0':'s_2_0','player_atk_1':'s_2_1','player_atk_2':'s_2_2','player_hurt':'s_2_3','player_dead':'s_2_4',
 'player_crouch':'s_2_5','player_roll':'s_2_6','player_ready':'s_2_7',
 # enemies
 'slime_0':'s_3_0','slime_1':'s_3_1','slime_dead':'s_3_2','slime_big':'b_1_0','slime_flat':'b_1_1',
 'skel_idle':'s_3_3','skel_walk':'s_3_4','skel_shoot':'s_3_6','skel_front':'b_1_2','skel_aim':'b_1_3',
 'charger_0':'s_4_0','charger_1':'s_4_1','charger_alert':'s_4_2','charger_run':'s_4_3','charger_hurt':'s_4_4','charger_dead':'s_4_5',
 'charger_front':'b_1_4','charger_dash':'b_1_5',
 'fx_redslash':'s_4_6','fx_boom':'s_4_7',
 # tiles
 'floor':'b_2_0','floor_moss':'b_2_1','wall':'b_2_2','wall_crack':'b_2_3','gate_closed':'b_2_4','gate_open':'b_2_5',
 'spike_off':'b_3_0','spike_warn':'b_3_1','spike_on':'b_3_2','launcher':'b_3_3','lever_off':'b_3_4','lever_on':'b_3_5',
 'key':'b_4_0','token':'b_4_1','exit_closed':'b_4_2','exit_open':'b_4_3','heart':'b_4_4','heart_empty':'b_4_5',
 'sword':'b_5_0','arrow':'b_5_1','fx_spark':'b_5_2','fx_dust':'b_5_3','chest':'b_5_4','chest_open':'b_5_5',
 'wall_l0':'s_5_0','wall_l1':'s_5_1','wall_l2':'s_5_2','wall_l3':'s_5_3','wall_t':'s_5_4','wall_x':'s_5_5','torch':'s_5_6','rubble':'s_5_7',
 # ui
 'ui_play':'s_6_0','ui_pause':'s_6_1','ui_restart':'s_6_2','ui_settings':'s_6_3','ui_trash':'s_6_4','ui_swap':'s_6_5','ui_undo':'s_6_6','ui_redo':'s_6_7',
 'medal_escape':'s_7_0','medal_treasure':'s_7_1','medal_flawless':'s_7_2','ui_timer':'s_7_3','ui_coin':'s_7_4','ui_key':'s_7_5','ui_sel_ok':'s_7_6','ui_sel_bad':'s_7_7',
}
imgs = {}
for k, f in names.items():
    imgs[k] = Image.open(f'slices/{f}.png')
m = Image.open('slices/s_3_5.png')
imgs['skel_hurt'] = m.crop((0,0,98,m.height)); imgs['skel_dead'] = m.crop((111,0,m.width,m.height))
for k in ('skel_hurt','skel_dead'):
    im = imgs[k]; bb = im.getbbox(); imgs[k] = im.crop(bb)
out = {}
items = []
for k, im in imgs.items():
    w, h = max(1, round(im.width*S)), max(1, round(im.height*S))
    items.append((k, im.resize((w, h), Image.LANCZOS), im.width, im.height))
items.sort(key=lambda t: -t[1].height)
W = 1024; pad = 2; x = y = 0; rowh = 0; placed = []
for k, im, ow, oh in items:
    if x + im.width + pad > W: x = 0; y += rowh + pad; rowh = 0
    placed.append((k, im, x, y, ow, oh)); x += im.width + pad; rowh = max(rowh, im.height)
H = y + rowh
atlas = Image.new('RGBA', (W, H), (0,0,0,0))
for k, im, x, y, ow, oh in placed:
    atlas.alpha_composite(im, (x, y))
    out[k] = [x, y, im.width, im.height, ow, oh]
atlas.save(sys.argv[1] + '/atlas.webp', 'WEBP', lossless=True, quality=100, method=6)
json.dump(out, open(sys.argv[2], 'w'), separators=(',',':'))
print(W, H, len(out))
