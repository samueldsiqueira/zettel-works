# Gera o personagem Ícaro no Blender (bpy): malha única com esqueleto, animações Idle e Run,
# exporta assets/models/icaro.glb e renderiza a folha de modelo em docs/arte/.
#
# Uso:  python tools/blender/build_icaro.py [--no-render]      (requer `pip install bpy`)
# Convenções: Z para cima, personagem olhando para -Y, 1 unidade = 1 m, altura ~1,6 m.
import math
import os
import sys

import bpy
from mathutils import Euler, Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT_GLB = os.path.join(ROOT, 'assets', 'models', 'icaro.glb')
OUT_ART = os.path.join(ROOT, 'docs', 'arte')
RENDER = '--no-render' not in sys.argv

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
col = scene.collection


# ── Materiais ────────────────────────────────────────────────────────────────
def mat(name, rgb, rough=0.55, emit=0.0, spec=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    if 'Specular IOR Level' in b.inputs:
        b.inputs['Specular IOR Level'].default_value = spec
    if emit:
        b.inputs['Emission Color'].default_value = (*rgb, 1)
        b.inputs['Emission Strength'].default_value = emit
    return m


def srgb(hexstr):
    h = hexstr.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)


M = {
    'skin': mat('Pele', srgb('#F6B98A'), 0.6),
    'vest': mat('Colete', srgb('#F0433A'), 0.5),      # cor do jogador
    'shorts': mat('Short', srgb('#2C4BD8'), 0.6),
    'hair': mat('Cabelo', srgb('#7A3E1D'), 0.7),
    'gold': mat('Dourado', srgb('#FFC83D'), 0.3, spec=0.8),
    'white': mat('Branco', srgb('#FFFDF5'), 0.6),
    'shoe': mat('Tenis', srgb('#FF8A1F'), 0.45),
    'dark': mat('Escuro', srgb('#1B2140'), 0.25, spec=0.9),
    'blush': mat('Bochecha', srgb('#FF8F8F'), 0.7),
    'mouth': mat('Boca', srgb('#8C2B2B'), 0.5),
}


# ── Utilidades de malha ──────────────────────────────────────────────────────
def activate(o):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o


def finish(o, material, bone):
    """Aplica transformações, material e prende todos os vértices a um osso (peso 1)."""
    activate(o)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.shade_smooth()
    o.data.materials.append(M[material])
    vg = o.vertex_groups.new(name=bone)
    vg.add(range(len(o.data.vertices)), 1.0, 'REPLACE')
    PARTS.append(o)
    return o


def blob(name, loc, scale, material, bone, rot=(0, 0, 0), seg=32):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, radius=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = scale if isinstance(scale, tuple) else (scale, scale, scale)
    return finish(o, material, bone)


def torus(name, loc, major, minor, scale, material, bone, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=48, minor_segments=10,
                                     location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    return finish(o, material, bone)


PARTS = []

# ── Corpo: malha contínua (Skin + Subdivision) ───────────────────────────────
# (posição, raio x, raio y)
J = [
    ((0, 0, 0.50), 0.165, 0.135),   # 0 quadril (raiz)
    ((0, 0, 0.66), 0.170, 0.135),   # 1 barriga
    ((0, 0, 0.81), 0.160, 0.125),   # 2 peito
    ((0, 0, 0.93), 0.065, 0.065),   # 3 pescoço
    ((0.17, 0, 0.855), 0.072, 0.072),  # 4 ombro E
    ((0.30, 0, 0.70), 0.058, 0.058),   # 5 cotovelo E
    ((0.41, 0, 0.56), 0.052, 0.052),   # 6 pulso E
    ((-0.17, 0, 0.855), 0.072, 0.072), ((-0.30, 0, 0.70), 0.058, 0.058), ((-0.41, 0, 0.56), 0.052, 0.052),
    ((0.095, 0, 0.44), 0.092, 0.095),  # 10 coxa E
    ((0.105, 0, 0.26), 0.078, 0.080),  # 11 joelho E
    ((0.105, 0, 0.09), 0.068, 0.070),  # 12 tornozelo E
    ((-0.095, 0, 0.44), 0.092, 0.095), ((-0.105, 0, 0.26), 0.078, 0.080), ((-0.105, 0, 0.09), 0.068, 0.070),
]
E = [(0, 1), (1, 2), (2, 3), (2, 4), (4, 5), (5, 6), (2, 7), (7, 8), (8, 9),
     (0, 10), (10, 11), (11, 12), (0, 13), (13, 14), (14, 15)]
me = bpy.data.meshes.new('Icaro')
me.from_pydata([j[0] for j in J], E, [])
body = bpy.data.objects.new('Icaro', me)
col.objects.link(body)
activate(body)
sk = body.modifiers.new('Skin', 'SKIN')
for i, j in enumerate(J):
    v = me.skin_vertices[0].data[i]
    v.radius = (j[1], j[2])
    v.use_root = i == 0
sub = body.modifiers.new('Sub', 'SUBSURF')
sub.levels = 2
bpy.ops.object.modifier_apply(modifier='Skin')
bpy.ops.object.modifier_apply(modifier='Sub')
bpy.ops.object.shade_smooth()
import bmesh  # noqa: E402
bm = bmesh.new()
bm.from_mesh(me)
for co, no in (((0, 0, 0.585), (0, 0, 1)), ((0, 0, 0.345), (0, 0, 1)), ((0, 0, 0.895), (0, 0, 1)),
               ((0.2, 0, 0), (1, 0, 0)), ((-0.2, 0, 0), (1, 0, 0))):
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no)
bm.to_mesh(me)
bm.free()
for k in ('skin', 'vest', 'shorts'):
    me.materials.append(M[k])
for p in me.polygons:
    c = p.center
    if 0.585 <= c.z <= 0.895 and abs(c.x) < 0.2:
        p.material_index = 1  # colete
    elif 0.345 <= c.z < 0.585 and abs(c.x) < 0.2:
        p.material_index = 2  # short

# ── Esqueleto ────────────────────────────────────────────────────────────────
arm_data = bpy.data.armatures.new('IcaroRig')
arm = bpy.data.objects.new('IcaroRig', arm_data)
col.objects.link(arm)
activate(arm)
bpy.ops.object.mode_set(mode='EDIT')
BONES = [  # nome, cabeça, cauda, pai
    ('hips', (0, 0, 0.50), (0, 0, 0.64), None),
    ('spine', (0, 0, 0.64), (0, 0, 0.80), 'hips'),
    ('chest', (0, 0, 0.80), (0, 0, 0.95), 'spine'),
    ('head', (0, 0, 0.95), (0, 0, 1.45), 'chest'),
]
for s, sx in (('L', 1), ('R', -1)):
    BONES += [
        (f'upper_arm.{s}', (0.17 * sx, 0, 0.855), (0.30 * sx, 0, 0.70), 'chest'),
        (f'forearm.{s}', (0.30 * sx, 0, 0.70), (0.41 * sx, 0, 0.56), f'upper_arm.{s}'),
        (f'hand.{s}', (0.41 * sx, 0, 0.56), (0.47 * sx, 0, 0.48), f'forearm.{s}'),
        (f'thigh.{s}', (0.095 * sx, 0, 0.44), (0.105 * sx, 0, 0.26), 'hips'),
        (f'shin.{s}', (0.105 * sx, 0, 0.26), (0.105 * sx, 0, 0.09), f'thigh.{s}'),
        (f'foot.{s}', (0.105 * sx, 0, 0.09), (0.105 * sx, -0.15, 0.03), f'shin.{s}'),
    ]
for name, h, t, parent in BONES:
    b = arm_data.edit_bones.new(name)
    b.head, b.tail = h, t
    if parent:
        b.parent = arm_data.edit_bones[parent]
        b.use_connect = (Vector(h) - arm_data.edit_bones[parent].tail).length < 1e-4
bpy.ops.object.mode_set(mode='OBJECT')

# pele automática do corpo
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
weighted = sum(1 for v in me.vertices if v.groups)
print(f'[icaro] corpo: {len(me.vertices)} vértices, {weighted} com peso')
if weighted < len(me.vertices) * 0.95:
    raise SystemExit('pesos automáticos falharam')
# cabeça e pés não devem deformar o corpo
for g in ('head', 'foot.L', 'foot.R'):
    vg = body.vertex_groups.get(g)
    if vg:
        body.vertex_groups.remove(vg)
activate(body)
bpy.ops.object.vertex_group_normalize_all(lock_active=False)

# ── Cabeça e rosto ───────────────────────────────────────────────────────────
HZ = 1.25  # centro da cabeça
blob('Cabeca', (0, 0, HZ), (0.375, 0.345, 0.335), 'skin', 'head', seg=48)
for sx in (1, -1):
    blob('Orelha', (0.365 * sx, 0.02, HZ - 0.03), (0.05, 0.06, 0.075), 'skin', 'head', seg=16)
    blob('Olho', (0.135 * sx, -0.312, HZ - 0.015), (0.05, 0.03, 0.078), 'dark', 'head', rot=(0, 0, 0.28 * sx), seg=24)
    blob('Brilho', (0.118 * sx, -0.338, HZ + 0.02), 0.017, 'white', 'head', seg=12)
    blob('Brilho2', (0.15 * sx, -0.33, HZ - 0.045), 0.008, 'white', 'head', seg=8)
    blob('Sobrancelha', (0.14 * sx, -0.30, HZ + 0.11), (0.055, 0.016, 0.014), 'hair', 'head', rot=(0, -0.22 * sx, 0.3 * sx), seg=12)
    blob('Bochecha', (0.225 * sx, -0.262, HZ - 0.105), (0.052, 0.012, 0.034), 'blush', 'head', rot=(0, 0, 0.62 * sx), seg=16)
blob('Nariz', (0, -0.345, HZ - 0.06), (0.026, 0.022, 0.02), 'skin', 'head', seg=12)
# sorriso: metade de baixo de um toro
bpy.ops.mesh.primitive_torus_add(major_radius=0.06, minor_radius=0.011, major_segments=32, minor_segments=8,
                                 location=(0, -0.318, HZ - 0.105), rotation=(math.radians(82), 0, 0))
o = bpy.context.object
o.name = 'Sorriso'
activate(o)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
bm = bmesh.new()
bm.from_mesh(o.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y > 0.012], context='VERTS')
bm.to_mesh(o.data)
bm.free()
finish(o, 'mouth', 'head')

# ── Cabelo (mechas arredondadas) + faixa de louros ───────────────────────────
blob('CabeloTopo', (0, 0.035, HZ + 0.10), (0.395, 0.37, 0.27), 'hair', 'head', seg=32)
blob('CabeloNuca', (0, 0.13, HZ - 0.04), (0.36, 0.26, 0.26), 'hair', 'head', seg=24)
for i, x in enumerate((-0.24, -0.12, 0.0, 0.12, 0.24)):
    blob('Franja', (x, -0.25 + abs(x) * 0.22, HZ + 0.225 - abs(x) * 0.12), (0.085, 0.075, 0.07), 'hair', 'head',
         rot=(0.5, 0, x * 1.4), seg=16)
blob('Topete', (0.04, -0.12, HZ + 0.36), (0.11, 0.13, 0.075), 'hair', 'head', rot=(0.5, 0.2, 0), seg=16)
blob('Topete2', (-0.08, 0.0, HZ + 0.375), (0.10, 0.12, 0.07), 'hair', 'head', rot=(0.1, -0.2, 0.4), seg=16)
for sx in (1, -1):
    blob('Costeleta', (0.33 * sx, -0.09, HZ + 0.05), (0.06, 0.08, 0.13), 'hair', 'head', seg=16)
torus('Faixa', (0, 0.03, HZ + 0.165), 0.395, 0.02, (1.0, 0.95, 1.0), 'gold', 'head', rot=(math.radians(-9), 0, 0))
for sx in (1, -1):  # folhas de louro nas laterais
    for k in range(4):
        a = math.radians(18 + k * 24)
        x, y = math.sin(a) * 0.405 * sx, -math.cos(a) * 0.385 + 0.03
        blob('Folha', (x, y, HZ + 0.225 - k * 0.012), (0.034, 0.012, 0.062), 'gold', 'head',
             rot=(math.radians(-18), 0.5 * sx, a * sx), seg=12)

# ── Mãos, tênis, cinto, asinhas ──────────────────────────────────────────────
for s, sx in (('L', 1), ('R', -1)):
    blob('Mao', (0.445 * sx, 0, 0.515), (0.07, 0.075, 0.085), 'skin', f'hand.{s}', rot=(0, 0.65 * sx, 0), seg=20)
    blob('Polegar', (0.425 * sx, -0.065, 0.53), (0.028, 0.04, 0.03), 'skin', f'hand.{s}', seg=10)
    blob('Tenis', (0.105 * sx, -0.055, 0.062), (0.088, 0.15, 0.066), 'shoe', f'foot.{s}', seg=24)
    blob('Sola', (0.105 * sx, -0.055, 0.022), (0.092, 0.155, 0.024), 'white', f'foot.{s}', seg=24)
    blob('Biqueira', (0.105 * sx, -0.165, 0.055), (0.06, 0.05, 0.042), 'white', f'foot.{s}', seg=12)
    blob('Meia', (0.105 * sx, 0, 0.125), (0.074, 0.076, 0.03), 'white', f'shin.{s}', seg=16)
    for k in range(3):  # penas, em leque, presas às costas
        ang = math.radians(20 + k * 26)
        ln = 0.19 - k * 0.03
        cx = (0.10 + math.cos(ang) * ln * 0.8) * sx
        cz = 0.80 + math.sin(ang) * ln * 0.8
        blob('Pena', (cx, 0.165, cz), (ln, 0.028, 0.062), 'white', 'chest', rot=(0, -ang * sx, 0.25 * sx), seg=16)
torus('Cinto', (0, 0, 0.59), 0.158, 0.017, (1.06, 0.86, 1.0), 'gold', 'hips')
blob('Fivela', (0, -0.14, 0.59), (0.035, 0.016, 0.03), 'gold', 'hips', seg=12)
blob('Emblema', (0, -0.128, 0.76), (0.045, 0.012, 0.045), 'white', 'chest', seg=16)

# junta tudo numa malha única presa ao esqueleto
bpy.ops.object.select_all(action='DESELECT')
for o in PARTS:
    o.select_set(True)
body.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
print(f'[icaro] malha final: {len(body.data.vertices)} vértices, {tris} triângulos')

# ── Animações ────────────────────────────────────────────────────────────────
REST = {b.name: b.matrix_local.to_3x3() for b in arm_data.bones}
for pb in arm.pose.bones:
    pb.rotation_mode = 'QUATERNION'


def rot(bone, rx=0.0, ry=0.0, rz=0.0):
    """Rotação dada nos eixos do personagem (X lateral, Y trás, Z cima), convertida para o eixo local do osso."""
    B = REST[bone]
    R = Euler((rx, ry, rz), 'XYZ').to_matrix()
    arm.pose.bones[bone].rotation_quaternion = (B.inverted() @ R @ B).to_quaternion()


def move(bone, x=0.0, y=0.0, z=0.0):
    arm.pose.bones[bone].location = REST[bone].inverted() @ Vector((x, y, z))


def key(frame):
    for pb in arm.pose.bones:
        pb.keyframe_insert('rotation_quaternion', frame=frame)
    arm.pose.bones['hips'].keyframe_insert('location', frame=frame)


def pose_idle(p):  # p = fase 0..2π
    s, c = math.sin(p), math.cos(p)
    move('hips', z=-0.008 * (1 - c))
    rot('hips')
    rot('spine', rx=0.02 + 0.015 * s)
    rot('chest', rx=0.01 * s)
    rot('head', rx=-0.02 - 0.02 * s, ry=0.035 * math.sin(p + 0.8))
    for sd, sx in (('L', 1), ('R', -1)):
        rot(f'upper_arm.{sd}', rx=0.05 * s, ry=(0.42 + 0.03 * s) * sx)
        rot(f'forearm.{sd}', rx=-0.22, ry=0.10 * sx)
        rot(f'hand.{sd}')
        rot(f'thigh.{sd}', ry=-0.03 * sx)
        rot(f'shin.{sd}', rx=0.02 * (1 - c))
        rot(f'foot.{sd}')


def pose_run(p):
    s = math.sin(p)
    move('hips', z=0.03 * math.cos(2 * p) - 0.03)
    rot('hips', rx=0.10, rz=-0.14 * s)
    rot('spine', rx=0.12, rz=0.10 * s)
    rot('chest', rx=0.08, rz=0.16 * s)
    rot('head', rx=-0.20, rz=-0.12 * s)
    for sd, sx, ph in (('L', 1, 0.0), ('R', -1, math.pi)):
        q = p + ph
        sw = math.sin(q)
        rot(f'thigh.{sd}', rx=-0.15 - 0.95 * sw)               # negativo = perna para frente
        rot(f'shin.{sd}', rx=0.25 + 1.05 * max(0.0, math.cos(q + 0.5)) ** 1.2)
        rot(f'foot.{sd}', rx=0.35 * max(0.0, -sw) - 0.15 * max(0.0, sw))
        rot(f'upper_arm.{sd}', rx=0.95 * sw, ry=0.50 * sx)      # braço oposto à perna
        rot(f'forearm.{sd}', rx=-1.25 - 0.25 * sw)
        rot(f'hand.{sd}')


arm.animation_data_create()
ACTIONS = {}
for name, fn, frames in (('Idle', pose_idle, 48), ('Run', pose_run, 16)):
    act = bpy.data.actions.new(name)
    arm.animation_data.action = act
    for f in range(frames + 1):
        fn(2 * math.pi * f / frames)
        key(f + 1)
    ACTIONS[name] = (act, frames, fn)
arm.animation_data.action = None
for name, (act, frames, _) in ACTIONS.items():  # uma faixa NLA por animação => uma animação no glTF
    tr = arm.animation_data.nla_tracks.new()
    tr.name = name
    tr.strips.new(name, 1, act)
    tr.mute = True

# ── Exporta GLB ──────────────────────────────────────────────────────────────
pose_idle(0)
os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
arm.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=True, export_yup=True,
                          export_animations=True, export_animation_mode='NLA_TRACKS', export_skins=True,
                          export_apply=False)
print(f'[icaro] exportado {OUT_GLB} ({os.path.getsize(OUT_GLB) / 1024:.0f} KB)')

if not RENDER:
    raise SystemExit(0)

# ── Folha de modelo (Cycles, CPU) ────────────────────────────────────────────
for tr in arm.animation_data.nla_tracks:
    tr.mute = True
scene.render.engine = 'CYCLES'
scene.cycles.samples = 64
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 560, 720
scene.view_settings.view_transform = 'Standard'
scene.render.film_transparent = False
world = bpy.data.worlds.new('W')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (*srgb('#8FD3F4'), 1)
world.node_tree.nodes['Background'].inputs[1].default_value = 0.45
scene.world = world
bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
floor = bpy.context.object
floor.data.materials.append(mat('Chao', srgb('#3FB7D9'), 0.9))


def light(kind, loc, energy, size=4.0, color=(1, 1, 1)):
    d = bpy.data.lights.new(kind, kind)
    d.energy = energy
    d.color = color
    if kind == 'AREA':
        d.size = size
    else:
        d.angle = math.radians(8)
    o = bpy.data.objects.new(kind, d)
    o.location = loc
    col.objects.link(o)
    o.rotation_euler = (Vector((0, 0, 0.9)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return o


light('SUN', (-3, -5, 7), 2.3, color=(1.0, 0.96, 0.9))
light('AREA', (4, -4, 2.5), 90, 5, (0.85, 0.93, 1.0))
light('AREA', (1.5, 5, 3.5), 300, 3, (1.0, 0.95, 0.85))  # contraluz
cam_d = bpy.data.cameras.new('Cam')
cam_d.lens = 70
cam = bpy.data.objects.new('Cam', cam_d)
col.objects.link(cam)
scene.camera = cam
cam.location = (0, -4.3, 1.15)
cam.rotation_euler = (Vector((0, 0, 0.84)) - cam.location).to_track_quat('-Z', 'Y').to_euler()

os.makedirs(OUT_ART, exist_ok=True)
SHOTS = [  # nome, animação, fase (fração do ciclo), giro do personagem em graus (0 = frente)
    ('1-frente', 'Idle', 0.0, 0), ('2-lado', 'Idle', 0.0, 90), ('3-costas', 'Idle', 0.0, 180),
    ('4-idle', 'Idle', 0.25, 30), ('5-corrida-a', 'Run', 0.25, 65), ('6-corrida-b', 'Run', 0.75, 65),
    ('7-corrida-frente', 'Run', 0.25, 20),
]
for name, anim, frac, turn in SHOTS:
    ACTIONS[anim][2](2 * math.pi * frac)
    arm.rotation_euler = (0, 0, math.radians(turn))
    bpy.context.view_layer.update()
    scene.render.filepath = os.path.join(OUT_ART, f'icaro-{name}.png')
    bpy.ops.render.render(write_still=True)
    print('[icaro] render', name)
