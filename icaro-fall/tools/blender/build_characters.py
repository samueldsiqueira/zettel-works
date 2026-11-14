# Gera os personagens do Ícaro Fall no Blender (bpy): malha única com esqueleto e animações,
# exportados em assets/models/{icaro,pinguim}.glb, mais as folhas de modelo em docs/arte/.
#
# Linha de comando:  python tools/blender/build_characters.py [icaro|pinguim] [--no-render]   (pip install bpy)
# Dentro do Blender: aba Scripting > abrir este arquivo > Run Script. ATENÇÃO: apaga os objetos da cena
#   aberta, cria o personagem escolhido em UI_CHARACTER e exporta o .glb ao lado do .blend salvo
#   (ou em ~/icaro-fall-out). Não renderiza.
#
# Convenções: Z para cima, personagem olhando para -Y (vira +Z no glTF), 1 unidade = 1 m, origem nos pés.
# Os dois personagens usam o MESMO esqueleto (nomes e posições dos ossos), então compartilham as animações:
# Idle, Run, Jump, Dive, Slide, Stun, Celebrate. O material "CorJogador" recebe a cor do jogador no jogo.
import math
import os
import sys

import bpy
import bmesh  # noqa: E402  (precisa vir depois de bpy)
from mathutils import Euler, Vector

UI_CHARACTER = 'icaro'  # usado só ao rodar dentro do Blender

IN_UI = not bpy.app.background or os.environ.get('ICARO_FORCE_UI') == '1'
_here = globals().get('__file__', '')
if os.path.isfile(_here) and not IN_UI:
    ROOT = os.path.abspath(os.path.join(os.path.dirname(_here), '..', '..'))
    OUT_MODELS = os.path.join(ROOT, 'assets', 'models')
    OUT_ART = os.path.join(ROOT, 'docs', 'arte')
else:
    ROOT = bpy.path.abspath('//') if bpy.data.filepath else os.path.join(os.path.expanduser('~'), 'icaro-fall-out')
    OUT_MODELS = ROOT
    OUT_ART = os.path.join(ROOT, 'arte')
RENDER = '--no-render' not in sys.argv and not IN_UI
WANTED = [a for a in sys.argv[1:] if a in ('icaro', 'pinguim')] or (['icaro', 'pinguim'] if not IN_UI else [UI_CHARACTER])


def srgb(hexstr):
    h = hexstr.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)


def reset_scene():
    if IN_UI:
        # read_factory_settings invalida o contexto da interface; só esvaziamos a cena atual
        if bpy.context.object and bpy.context.object.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
        for o in list(bpy.data.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.actions, bpy.data.lights,
                     bpy.data.cameras):
            for d in list(coll):
                if d.users == 0:
                    coll.remove(d)
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True)


class Builder:
    """Estado de construção de um personagem: materiais, peças soltas e utilidades de malha."""

    def __init__(self, palette):
        self.scene = bpy.context.scene
        self.col = self.scene.collection
        self.parts = []
        self.M = {}
        for key, (name, hexc, rough, spec) in palette.items():
            m = bpy.data.materials.new(name)
            m.use_nodes = True
            b = m.node_tree.nodes['Principled BSDF']
            b.inputs['Base Color'].default_value = (*srgb(hexc), 1)
            b.inputs['Roughness'].default_value = rough
            if 'Specular IOR Level' in b.inputs:
                b.inputs['Specular IOR Level'].default_value = spec
            self.M[key] = m

    @staticmethod
    def activate(o):
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o

    def finish(self, o, material, bone):
        """Aplica transformações e material; prende todos os vértices a um osso (peso 1)."""
        self.activate(o)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        for p in o.data.polygons:
            p.use_smooth = True
        o.data.materials.append(self.M[material])
        o.vertex_groups.new(name=bone).add(range(len(o.data.vertices)), 1.0, 'REPLACE')
        self.parts.append(o)
        return o

    def blob(self, name, loc, scale, material, bone, rot=(0, 0, 0), seg=32):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=max(6, seg // 2), radius=1, location=loc, rotation=rot)
        o = bpy.context.object
        o.name = name
        o.scale = scale if isinstance(scale, tuple) else (scale, scale, scale)
        return self.finish(o, material, bone)

    def torus(self, name, loc, major, minor, scale, material, bone, rot=(0, 0, 0), keep=None):
        bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=48, minor_segments=10,
                                         location=loc, rotation=rot)
        o = bpy.context.object
        o.name = name
        o.scale = scale
        if keep:  # recorta: mantém só os vértices (em coordenadas locais) que passam no teste
            bm = bmesh.new()
            bm.from_mesh(o.data)
            bmesh.ops.delete(bm, geom=[v for v in bm.verts if not keep(v.co)], context='VERTS')
            bm.to_mesh(o.data)
            bm.free()
        return self.finish(o, material, bone)


# ── Esqueleto compartilhado ──────────────────────────────────────────────────
def bone_table():
    bones = [  # nome, cabeça, cauda, pai
        ('hips', (0, 0, 0.50), (0, 0, 0.64), None),
        ('spine', (0, 0, 0.64), (0, 0, 0.80), 'hips'),
        ('chest', (0, 0, 0.80), (0, 0, 0.95), 'spine'),
        ('head', (0, 0, 0.95), (0, 0, 1.45), 'chest'),
    ]
    for s, sx in (('L', 1), ('R', -1)):
        bones += [
            (f'upper_arm.{s}', (0.17 * sx, 0, 0.855), (0.30 * sx, 0, 0.70), 'chest'),
            (f'forearm.{s}', (0.30 * sx, 0, 0.70), (0.41 * sx, 0, 0.56), f'upper_arm.{s}'),
            (f'hand.{s}', (0.41 * sx, 0, 0.56), (0.47 * sx, 0, 0.48), f'forearm.{s}'),
            (f'thigh.{s}', (0.095 * sx, 0, 0.44), (0.105 * sx, 0, 0.26), 'hips'),
            (f'shin.{s}', (0.105 * sx, 0, 0.26), (0.105 * sx, 0, 0.09), f'thigh.{s}'),
            (f'foot.{s}', (0.105 * sx, 0, 0.09), (0.105 * sx, -0.15, 0.03), f'shin.{s}'),
        ]
    return bones


def make_rig(B, name):
    arm_data = bpy.data.armatures.new(name)
    arm = bpy.data.objects.new(name, arm_data)
    B.col.objects.link(arm)
    B.activate(arm)
    bpy.ops.object.mode_set(mode='EDIT')
    for bname, h, t, parent in bone_table():
        b = arm_data.edit_bones.new(bname)
        b.head, b.tail = h, t
        if parent:
            b.parent = arm_data.edit_bones[parent]
            b.use_connect = (Vector(h) - arm_data.edit_bones[parent].tail).length < 1e-4
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


# ── Ícaro ────────────────────────────────────────────────────────────────────
ICARO_PALETTE = {
    'skin': ('Pele', '#F6B98A', 0.6, 0.5), 'player': ('CorJogador', '#F0433A', 0.5, 0.5),
    'shorts': ('Short', '#2C4BD8', 0.6, 0.5), 'hair': ('Cabelo', '#7A3E1D', 0.7, 0.5),
    'gold': ('Dourado', '#FFC83D', 0.3, 0.8), 'white': ('Branco', '#FFFDF5', 0.6, 0.5),
    'shoe': ('Tenis', '#FF8A1F', 0.45, 0.5), 'dark': ('Escuro', '#1B2140', 0.25, 0.9),
    'blush': ('Bochecha', '#FF8F8F', 0.7, 0.5), 'mouth': ('Boca', '#8C2B2B', 0.5, 0.5),
}


def build_icaro():
    B = Builder(ICARO_PALETTE)
    # corpo: malha contínua (Skin + Subdivision) — (posição, raio x, raio y)
    J = [
        ((0, 0, 0.50), 0.165, 0.135), ((0, 0, 0.66), 0.170, 0.135), ((0, 0, 0.81), 0.160, 0.125),
        ((0, 0, 0.93), 0.065, 0.065),
        ((0.17, 0, 0.855), 0.072, 0.072), ((0.30, 0, 0.70), 0.058, 0.058), ((0.41, 0, 0.56), 0.052, 0.052),
        ((-0.17, 0, 0.855), 0.072, 0.072), ((-0.30, 0, 0.70), 0.058, 0.058), ((-0.41, 0, 0.56), 0.052, 0.052),
        ((0.095, 0, 0.44), 0.092, 0.095), ((0.105, 0, 0.26), 0.078, 0.080), ((0.105, 0, 0.09), 0.068, 0.070),
        ((-0.095, 0, 0.44), 0.092, 0.095), ((-0.105, 0, 0.26), 0.078, 0.080), ((-0.105, 0, 0.09), 0.068, 0.070),
    ]
    E = [(0, 1), (1, 2), (2, 3), (2, 4), (4, 5), (5, 6), (2, 7), (7, 8), (8, 9),
         (0, 10), (10, 11), (11, 12), (0, 13), (13, 14), (14, 15)]
    me = bpy.data.meshes.new('Icaro')
    me.from_pydata([j[0] for j in J], E, [])
    body = bpy.data.objects.new('Icaro', me)
    B.col.objects.link(body)
    B.activate(body)
    body.modifiers.new('Skin', 'SKIN')
    for i, j in enumerate(J):
        v = me.skin_vertices[0].data[i]
        v.radius = (j[1], j[2])
        v.use_root = i == 0
    body.modifiers.new('Sub', 'SUBSURF').levels = 2
    baked = bpy.data.meshes.new_from_object(body.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    body.modifiers.clear()
    body.data = baked
    bpy.data.meshes.remove(me)
    me = baked
    me.name = 'Icaro'
    # recorte reto das roupas
    bm = bmesh.new()
    bm.from_mesh(me)
    for co, no in (((0, 0, 0.585), (0, 0, 1)), ((0, 0, 0.345), (0, 0, 1)), ((0, 0, 0.895), (0, 0, 1)),
                   ((0.2, 0, 0), (1, 0, 0)), ((-0.2, 0, 0), (1, 0, 0))):
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no)
    bm.to_mesh(me)
    bm.free()
    for k in ('skin', 'player', 'shorts'):
        me.materials.append(B.M[k])
    for p in me.polygons:
        p.use_smooth = True
        c = p.center
        if 0.585 <= c.z <= 0.895 and abs(c.x) < 0.2:
            p.material_index = 1
        elif 0.345 <= c.z < 0.585 and abs(c.x) < 0.2:
            p.material_index = 2

    arm = make_rig(B, 'IcaroRig')
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    if sum(1 for v in me.vertices if v.groups) < len(me.vertices) * 0.95:
        raise RuntimeError('pesos automáticos falharam')
    for g in ('head', 'foot.L', 'foot.R'):  # cabeça e pés são peças rígidas; não deformam o corpo
        vg = body.vertex_groups.get(g)
        if vg:
            body.vertex_groups.remove(vg)
    B.activate(body)
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)

    HZ = 1.25
    B.blob('Cabeca', (0, 0, HZ), (0.375, 0.345, 0.335), 'skin', 'head', seg=48)
    for sx in (1, -1):
        B.blob('Orelha', (0.365 * sx, 0.02, HZ - 0.03), (0.05, 0.06, 0.075), 'skin', 'head', seg=16)
        B.blob('Olho', (0.135 * sx, -0.312, HZ - 0.015), (0.05, 0.03, 0.078), 'dark', 'head', rot=(0, 0, 0.28 * sx), seg=24)
        B.blob('Brilho', (0.118 * sx, -0.338, HZ + 0.02), 0.017, 'white', 'head', seg=12)
        B.blob('Brilho2', (0.15 * sx, -0.33, HZ - 0.045), 0.008, 'white', 'head', seg=8)
        B.blob('Sobrancelha', (0.14 * sx, -0.30, HZ + 0.11), (0.055, 0.016, 0.014), 'hair', 'head',
               rot=(0, -0.22 * sx, 0.3 * sx), seg=12)
        B.blob('Bochecha', (0.225 * sx, -0.262, HZ - 0.105), (0.052, 0.012, 0.034), 'blush', 'head', rot=(0, 0, 0.62 * sx), seg=16)
    B.blob('Nariz', (0, -0.345, HZ - 0.06), (0.026, 0.022, 0.02), 'skin', 'head', seg=12)
    B.torus('Sorriso', (0, -0.318, HZ - 0.105), 0.06, 0.011, (1, 1, 1), 'mouth', 'head', rot=(math.radians(82), 0, 0),
            keep=lambda co: co.y <= 0.012)
    B.blob('CabeloTopo', (0, 0.035, HZ + 0.10), (0.395, 0.37, 0.27), 'hair', 'head')
    B.blob('CabeloNuca', (0, 0.13, HZ - 0.04), (0.36, 0.26, 0.26), 'hair', 'head', seg=24)
    for x in (-0.24, -0.12, 0.0, 0.12, 0.24):
        B.blob('Franja', (x, -0.25 + abs(x) * 0.22, HZ + 0.225 - abs(x) * 0.12), (0.085, 0.075, 0.07), 'hair', 'head',
               rot=(0.5, 0, x * 1.4), seg=16)
    B.blob('Topete', (0.04, -0.12, HZ + 0.36), (0.11, 0.13, 0.075), 'hair', 'head', rot=(0.5, 0.2, 0), seg=16)
    B.blob('Topete2', (-0.08, 0.0, HZ + 0.375), (0.10, 0.12, 0.07), 'hair', 'head', rot=(0.1, -0.2, 0.4), seg=16)
    for sx in (1, -1):
        B.blob('Costeleta', (0.33 * sx, -0.09, HZ + 0.05), (0.06, 0.08, 0.13), 'hair', 'head', seg=16)
    B.torus('Faixa', (0, 0.03, HZ + 0.165), 0.395, 0.02, (1.0, 0.95, 1.0), 'gold', 'head', rot=(math.radians(-9), 0, 0))
    for sx in (1, -1):
        for k in range(4):
            a = math.radians(18 + k * 24)
            x, y = math.sin(a) * 0.405 * sx, -math.cos(a) * 0.385 + 0.03
            B.blob('Folha', (x, y, HZ + 0.225 - k * 0.012), (0.034, 0.012, 0.062), 'gold', 'head',
                   rot=(math.radians(-18), 0.5 * sx, a * sx), seg=12)
    for s, sx in (('L', 1), ('R', -1)):
        B.blob('Mao', (0.445 * sx, 0, 0.515), (0.07, 0.075, 0.085), 'skin', f'hand.{s}', rot=(0, 0.65 * sx, 0), seg=20)
        B.blob('Polegar', (0.425 * sx, -0.065, 0.53), (0.028, 0.04, 0.03), 'skin', f'hand.{s}', seg=10)
        B.blob('Tenis', (0.105 * sx, -0.055, 0.062), (0.088, 0.15, 0.066), 'shoe', f'foot.{s}', seg=24)
        B.blob('Sola', (0.105 * sx, -0.055, 0.022), (0.092, 0.155, 0.024), 'white', f'foot.{s}', seg=24)
        B.blob('Biqueira', (0.105 * sx, -0.165, 0.055), (0.06, 0.05, 0.042), 'white', f'foot.{s}', seg=12)
        B.blob('Meia', (0.105 * sx, 0, 0.125), (0.074, 0.076, 0.03), 'white', f'shin.{s}', seg=16)
        for k in range(3):  # penas em leque, presas às costas
            ang = math.radians(20 + k * 26)
            ln = 0.19 - k * 0.03
            B.blob('Pena', ((0.10 + math.cos(ang) * ln * 0.8) * sx, 0.165, 0.80 + math.sin(ang) * ln * 0.8),
                   (ln, 0.028, 0.062), 'white', 'chest', rot=(0, -ang * sx, 0.25 * sx), seg=16)
    B.torus('Cinto', (0, 0, 0.59), 0.158, 0.017, (1.06, 0.86, 1.0), 'gold', 'hips')
    B.blob('Fivela', (0, -0.14, 0.59), (0.035, 0.016, 0.03), 'gold', 'hips', seg=12)
    B.blob('Emblema', (0, -0.128, 0.76), (0.045, 0.012, 0.045), 'white', 'chest', seg=16)
    return B, body, arm


# ── Pinguim ──────────────────────────────────────────────────────────────────
PINGUIM_PALETTE = {
    'player': ('CorJogador', '#2F7BF5', 0.5, 0.5), 'white': ('Barriga', '#FFFDF5', 0.6, 0.5),
    'beak': ('Bico', '#FF9A1F', 0.45, 0.6), 'dark': ('Escuro', '#1B2140', 0.25, 0.9),
    'blush': ('Bochecha', '#FF8F8F', 0.7, 0.5), 'glass': ('Lente', '#8EE6FF', 0.15, 1.0),
    'strap': ('Tira', '#FFD23F', 0.5, 0.5),
}


def build_pinguim():
    B = Builder(PINGUIM_PALETTE)
    # corpo em forma de ovo (peça rígida no tronco) — vira a malha base
    body = B.blob('Pinguim', (0, 0.01, 0.52), (0.34, 0.31, 0.44), 'player', 'spine', seg=48)
    B.parts.remove(body)
    B.blob('Barriga', (0, -0.065, 0.50), (0.27, 0.27, 0.38), 'white', 'spine', seg=40)
    B.blob('Rabo', (0, 0.27, 0.22), (0.10, 0.12, 0.06), 'player', 'hips', rot=(-0.5, 0, 0), seg=16)
    HZ = 1.13
    B.blob('Cabeca', (0, 0, HZ), (0.315, 0.30, 0.29), 'player', 'head', seg=48)
    B.blob('Mascara', (0, -0.075, HZ - 0.035), (0.255, 0.245, 0.225), 'white', 'head', seg=40)
    B.blob('Topete', (0, -0.02, HZ + 0.285), (0.05, 0.09, 0.05), 'player', 'head', rot=(-0.6, 0, 0), seg=12)
    for sx in (1, -1):
        B.blob('Olho', (0.115 * sx, -0.295, HZ + 0.02), (0.042, 0.028, 0.066), 'dark', 'head', rot=(0, 0, 0.3 * sx), seg=24)
        B.blob('Brilho', (0.10 * sx, -0.318, HZ + 0.05), 0.015, 'white', 'head', seg=12)
        B.blob('Bochecha', (0.195 * sx, -0.245, HZ - 0.075), (0.046, 0.012, 0.03), 'blush', 'head', rot=(0, 0, 0.62 * sx), seg=16)
        # óculos de natação na testa
        B.blob('Lente', (0.105 * sx, -0.235, HZ + 0.185), (0.075, 0.03, 0.055), 'glass', 'head', rot=(-0.55, 0, 0.25 * sx), seg=20)
        B.torus('Aro', (0.105 * sx, -0.238, HZ + 0.187), 0.07, 0.014, (1.05, 0.8, 1.0), 'strap', 'head',
                rot=(math.radians(90 - 31), 0, 0.25 * sx))
    B.torus('Tira', (0, 0.0, HZ + 0.17), 0.30, 0.016, (1.0, 0.97, 1.0), 'strap', 'head', rot=(math.radians(-12), 0, 0))
    B.blob('BicoCima', (0, -0.33, HZ - 0.045), (0.085, 0.10, 0.04), 'beak', 'head', seg=20)
    B.blob('BicoBaixo', (0, -0.31, HZ - 0.075), (0.065, 0.075, 0.028), 'beak', 'head', seg=16)
    for s, sx in (('L', 1), ('R', -1)):
        # nadadeira: elipsoide ao longo do braço (ombro -> pulso), rígida no osso do braço
        a = Vector((0.29 * sx, 0, 0.80))
        b = Vector((0.52 * sx, 0, 0.47))
        mid, ln = (a + b) / 2, (b - a).length / 2 + 0.05
        ang = math.atan2(b.x - a.x, -(b.z - a.z))  # rotação em Y a partir de "para baixo"
        B.blob('Nadadeira', tuple(mid), (0.085, 0.04, ln), 'player', f'upper_arm.{s}', rot=(0, -ang, 0), seg=24)
        B.blob('Pe', (0.115 * sx, -0.08, 0.035), (0.11, 0.16, 0.035), 'beak', f'foot.{s}', seg=24)
        for k in (-1, 0, 1):
            B.blob('Dedo', ((0.115 + 0.06 * k) * sx, -0.215, 0.03), (0.035, 0.05, 0.026), 'beak', f'foot.{s}', seg=10)
        B.blob('Perna', (0.105 * sx, 0, 0.12), (0.06, 0.06, 0.09), 'beak', f'shin.{s}', seg=12)
    arm = make_rig(B, 'PinguimRig')
    body.parent = arm
    body.modifiers.new('Armature', 'ARMATURE').object = arm
    return B, body, arm


# ── Animações (compartilhadas) ───────────────────────────────────────────────
class Animator:
    def __init__(self, arm):
        self.arm = arm
        self.rest = {b.name: b.matrix_local.to_3x3() for b in arm.data.bones}
        for pb in arm.pose.bones:
            pb.rotation_mode = 'QUATERNION'

    def rot(self, bone, rx=0.0, ry=0.0, rz=0.0):
        """Rotação nos eixos do personagem (X lateral, Y para trás, Z para cima), convertida para o eixo do osso.
        Ossos que apontam para cima: rx>0 inclina para frente. Ossos que apontam para baixo: rx<0 leva para frente."""
        Bm = self.rest[bone]
        R = Euler((rx, ry, rz), 'XYZ').to_matrix()
        self.arm.pose.bones[bone].rotation_quaternion = (Bm.inverted() @ R @ Bm).to_quaternion()

    def move(self, x=0.0, y=0.0, z=0.0):
        self.arm.pose.bones['hips'].location = self.rest['hips'].inverted() @ Vector((x, y, z))

    def clear(self):
        for pb in self.arm.pose.bones:
            pb.rotation_quaternion = (1, 0, 0, 0)
            pb.location = (0, 0, 0)

    def key(self, frame):
        for pb in self.arm.pose.bones:
            pb.keyframe_insert('rotation_quaternion', frame=frame)
        self.arm.pose.bones['hips'].keyframe_insert('location', frame=frame)


SIDES = (('L', 1, 0.0), ('R', -1, math.pi))


def pose_idle(A, p):
    s, c = math.sin(p), math.cos(p)
    A.move(z=-0.008 * (1 - c))
    A.rot('spine', rx=0.02 + 0.015 * s)
    A.rot('chest', rx=0.01 * s)
    A.rot('head', rx=-0.02 - 0.02 * s, ry=0.035 * math.sin(p + 0.8))
    for sd, sx, _ in SIDES:
        A.rot(f'upper_arm.{sd}', rx=0.05 * s, ry=(0.42 + 0.03 * s) * sx)
        A.rot(f'forearm.{sd}', rx=-0.22, ry=0.10 * sx)
        A.rot(f'thigh.{sd}', ry=-0.03 * sx)
        A.rot(f'shin.{sd}', rx=0.02 * (1 - c))


def pose_run(A, p):
    s = math.sin(p)
    A.move(z=0.03 * math.cos(2 * p) - 0.03)
    A.rot('hips', rx=0.10, rz=-0.14 * s)
    A.rot('spine', rx=0.12, rz=0.10 * s)
    A.rot('chest', rx=0.08, rz=0.16 * s)
    A.rot('head', rx=-0.20, rz=-0.12 * s)
    for sd, sx, ph in SIDES:
        q = p + ph
        sw = math.sin(q)
        A.rot(f'thigh.{sd}', rx=-0.15 - 0.95 * sw)
        A.rot(f'shin.{sd}', rx=0.25 + 1.05 * max(0.0, math.cos(q + 0.5)) ** 1.2)
        A.rot(f'foot.{sd}', rx=0.35 * max(0.0, -sw) - 0.15 * max(0.0, sw))
        A.rot(f'upper_arm.{sd}', rx=0.95 * sw, ry=0.50 * sx)
        A.rot(f'forearm.{sd}', rx=-1.25 - 0.25 * sw)


def pose_jump(A, p):
    s = math.sin(p)
    A.rot('hips', rx=0.06)
    A.rot('spine', rx=-0.06)
    A.rot('head', rx=-0.12)
    for sd, sx, ph in SIDES:
        k = 1 if sd == 'L' else 0
        A.rot(f'thigh.{sd}', rx=-0.75 + 0.5 * k + 0.05 * s, ry=-0.10 * sx)
        A.rot(f'shin.{sd}', rx=1.1 - 0.5 * k)
        A.rot(f'foot.{sd}', rx=0.3)
        A.rot(f'upper_arm.{sd}', rx=0.1 * s, ry=(-0.95 + 0.08 * s) * sx)   # braços abertos para cima
        A.rot(f'forearm.{sd}', ry=-0.45 * sx)


def _prone(A, p, drop, head_up, arm_ry, flutter, knee):
    """Corpo na horizontal, de barriga para baixo, cabeça para frente."""
    s = math.sin(p)
    A.rot('hips', rx=1.42)
    A.move(z=drop)
    A.rot('spine', rx=-0.10)
    A.rot('chest', rx=-0.12)
    A.rot('head', rx=head_up)
    for sd, sx, ph in SIDES:
        f = math.sin(p + ph)
        A.rot(f'upper_arm.{sd}', ry=(arm_ry + 0.04 * s) * sx)   # braços estendidos à frente
        A.rot(f'forearm.{sd}', ry=-0.30 * sx)
        A.rot(f'thigh.{sd}', rx=0.12 + flutter * f, ry=-0.06 * sx)
        A.rot(f'shin.{sd}', rx=knee + flutter * 0.6 * max(0.0, f))
        A.rot(f'foot.{sd}', rx=0.7)


def pose_dive(A, p):
    _prone(A, p, drop=-0.14, head_up=-0.62, arm_ry=-2.15, flutter=0.10, knee=0.10)


def pose_slide(A, p):
    _prone(A, p, drop=-0.285, head_up=-0.85, arm_ry=-1.95, flutter=0.16, knee=0.45)


def pose_stun(A, p):
    s, c = math.sin(p), math.cos(p)
    A.rot('hips', rx=0.06 * c, ry=0.06 * s)
    A.rot('spine', rx=0.14 * c, ry=0.14 * s)
    A.rot('chest', rx=0.08 * c, ry=0.08 * s)
    A.rot('head', rx=0.22 * math.cos(p + 0.9), ry=0.26 * math.sin(p + 0.9))
    for sd, sx, _ in SIDES:
        A.rot(f'upper_arm.{sd}', rx=0.15 * s * sx, ry=(0.10 + 0.12 * c * sx) * sx)
        A.rot(f'forearm.{sd}', rx=-0.35)
        A.rot(f'thigh.{sd}', ry=-0.14 * sx, rx=0.06 * s * sx)
        A.rot(f'shin.{sd}', rx=0.18)


def pose_celebrate(A, p):
    hop = abs(math.sin(p))
    s2 = math.sin(2 * p)
    A.move(z=0.16 * hop - 0.03)
    A.rot('spine', rx=-0.08)
    A.rot('head', rx=-0.22, ry=0.10 * math.sin(p))
    for sd, sx, _ in SIDES:
        A.rot(f'upper_arm.{sd}', ry=(-1.75 + 0.22 * s2 * sx) * sx)          # braços para o alto, balançando
        A.rot(f'forearm.{sd}', ry=(-0.35 - 0.25 * s2 * sx) * sx)
        A.rot(f'thigh.{sd}', rx=-0.30 * (1 - hop), ry=-0.12 * sx)
        A.rot(f'shin.{sd}', rx=0.65 * (1 - hop))
        A.rot(f'foot.{sd}', rx=0.4 * hop)


ANIMS = [  # nome, pose, quadros por ciclo (30 fps)
    ('Idle', pose_idle, 48), ('Run', pose_run, 16), ('Jump', pose_jump, 24), ('Dive', pose_dive, 16),
    ('Slide', pose_slide, 20), ('Stun', pose_stun, 24), ('Celebrate', pose_celebrate, 24),
]


def animate(arm):
    A = Animator(arm)
    arm.animation_data_create()
    actions = {}
    for name, fn, frames in ANIMS:
        act = bpy.data.actions.new(name)
        arm.animation_data.action = act
        for f in range(frames + 1):
            A.clear()
            fn(A, 2 * math.pi * f / frames)
            A.key(f + 1)
        actions[name] = act
    arm.animation_data.action = None
    for name, act in actions.items():  # uma faixa NLA por animação => uma animação no glTF
        tr = arm.animation_data.nla_tracks.new()
        tr.name = name
        tr.strips.new(name, 1, act)
        tr.mute = True
    A.clear()
    pose_idle(A, 0)
    return A


# ── Render da folha de modelo (Cycles, CPU) ──────────────────────────────────
def render_sheet(B, arm, A, key):
    scene = B.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 520, 640
    scene.view_settings.view_transform = 'Standard'
    world = bpy.data.worlds.new('W')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (*srgb('#8FD3F4'), 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = 0.45
    scene.world = world
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
    fm = bpy.data.materials.new('Chao')
    fm.use_nodes = True
    fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*srgb('#3FB7D9'), 1)
    bpy.context.object.data.materials.append(fm)

    def light(kind, loc, energy, size=4.0, color=(1, 1, 1)):
        d = bpy.data.lights.new(kind, kind)
        d.energy, d.color = energy, color
        if kind == 'AREA':
            d.size = size
        else:
            d.angle = math.radians(8)
        o = bpy.data.objects.new(kind, d)
        o.location = loc
        B.col.objects.link(o)
        o.rotation_euler = (Vector((0, 0, 0.9)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()

    light('SUN', (-3, -5, 7), 2.3, color=(1.0, 0.96, 0.9))
    light('AREA', (4, -4, 2.5), 90, 5, (0.85, 0.93, 1.0))
    light('AREA', (1.5, 5, 3.5), 300, 3, (1.0, 0.95, 0.85))
    cam_d = bpy.data.cameras.new('Cam')
    cam_d.lens = 70
    cam = bpy.data.objects.new('Cam', cam_d)
    B.col.objects.link(cam)
    scene.camera = cam
    cam.location = (0, -4.5, 1.15)
    cam.rotation_euler = (Vector((0, 0, 0.80)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    for tr in arm.animation_data.nla_tracks:
        tr.mute = True
    fns = {n: f for n, f, _ in ANIMS}
    shots = [  # nome, animação, fase, giro (0 = frente)
        ('1-frente', 'Idle', 0.0, 0), ('2-lado', 'Idle', 0.0, 90), ('3-costas', 'Idle', 0.0, 180),
        ('4-corrida', 'Run', 0.25, 65), ('5-pulo', 'Jump', 0.0, 30), ('6-mergulho', 'Dive', 0.0, 70),
        ('7-deslize', 'Slide', 0.25, 70), ('8-comemora', 'Celebrate', 0.25, 15),
    ]
    os.makedirs(OUT_ART, exist_ok=True)
    paths = []
    for name, anim, frac, turn in shots:
        A.clear()
        fns[anim](A, 2 * math.pi * frac)
        arm.rotation_euler = (0, 0, math.radians(turn))
        bpy.context.view_layer.update()
        scene.render.filepath = os.path.join(OUT_ART, f'{key}-{name}.png')
        bpy.ops.render.render(write_still=True)
        paths.append(scene.render.filepath)
    try:  # monta a folha única, se o Pillow estiver disponível
        from PIL import Image
        ims = [Image.open(p) for p in paths]
        w, h = ims[0].size
        sheet = Image.new('RGB', (w * 4, h * 2))
        for i, im in enumerate(ims):
            sheet.paste(im, ((i % 4) * w, (i // 4) * h))
        sheet.save(os.path.join(OUT_ART, f'{key}-folha.png'))
        for p in paths:
            os.remove(p)
    except ImportError:
        pass


# ── Principal ────────────────────────────────────────────────────────────────
BUILDERS = {'icaro': build_icaro, 'pinguim': build_pinguim}
for key in WANTED:
    reset_scene()
    B, body, arm = BUILDERS[key]()
    bpy.ops.object.select_all(action='DESELECT')
    for o in B.parts:
        o.select_set(True)
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
    A = animate(arm)
    os.makedirs(OUT_MODELS, exist_ok=True)
    out = os.path.join(OUT_MODELS, f'{key}.glb')
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    arm.select_set(True)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_yup=True,
                              export_animations=True, export_animation_mode='NLA_TRACKS', export_skins=True,
                              export_apply=False)
    print(f'[personagens] {key}: {tris} triângulos, {os.path.getsize(out) / 1024:.0f} KB -> {out}')
    if RENDER:
        render_sheet(B, arm, A, key)
    elif IN_UI:
        for tr in arm.animation_data.nla_tracks:  # deixa o Idle tocando ao dar play
            tr.mute = tr.name != 'Idle'
        B.scene.frame_start, B.scene.frame_end = 1, 48
        B.scene.frame_set(1)
