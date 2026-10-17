import sys, json
import numpy as np
from PIL import Image
from collections import deque
B = 4
def label_blocks(alpha):
    H, W = alpha.shape
    bh, bw = (H+B-1)//B, (W+B-1)//B
    pad = np.zeros((bh*B, bw*B), bool); pad[:H,:W] = alpha
    blk = pad.reshape(bh, B, bw, B).any(axis=(1,3))
    d = blk.copy()
    d[1:] |= blk[:-1]; d[:-1] |= blk[1:]; d[:,1:] |= blk[:,:-1]; d[:,:-1] |= blk[:,1:]
    lab = np.zeros(d.shape, int); n = 0
    for y in range(bh):
        for x in range(bw):
            if d[y,x] and not lab[y,x]:
                n += 1; q = deque([(y,x)]); lab[y,x] = n
                while q:
                    cy, cx = q.popleft()
                    for ny, nx in ((cy+1,cx),(cy-1,cx),(cy,cx+1),(cy,cx-1)):
                        if 0<=ny<bh and 0<=nx<bw and d[ny,nx] and not lab[ny,nx]:
                            lab[ny,nx] = n; q.append((ny,nx))
    full = np.repeat(np.repeat(lab, B, 0), B, 1)[:H,:W]
    return full, n

def slice_sheet(path, cols, rows, out_prefix, outdir):
    im = Image.open(path).convert("RGBA")
    a = np.array(im)
    alpha = a[:,:,3] > 24
    lab, n = label_blocks(alpha)
    H, W = alpha.shape
    cw, ch = W/cols, H/rows
    cells = {}
    objs = []
    for i in range(1, n+1):
        yy, xx = np.nonzero(lab == i)
        objs.append((slice(yy.min(), yy.max()+1), slice(xx.min(), xx.max()+1)))
    for i, sl in enumerate(objs):
        ys, xs = sl
        mask = (lab[sl] == i+1) & alpha[sl]
        cnt = mask.sum()
        if cnt < 30: continue
        yy, xx = np.nonzero(mask)
        cy = ys.start + yy.mean(); cx = xs.start + xx.mean()
        key = (int(cy//ch), int(cx//cw))
        cells.setdefault(key, []).append((sl, i+1, cnt))
    res = {}
    for (r,c), comps in sorted(cells.items()):
        x0 = min(s[1].start for s,_,_ in comps); x1 = max(s[1].stop for s,_,_ in comps)
        y0 = min(s[0].start for s,_,_ in comps); y1 = max(s[0].stop for s,_,_ in comps)
        keep = np.zeros((y1-y0, x1-x0), bool)
        for s, lid, _ in comps:
            sub = lab[y0:y1, x0:x1] == lid
            keep |= sub
        crop = a[y0:y1, x0:x1].copy()
        crop[~keep] = 0
        # tighten to alpha
        al = crop[:,:,3] > 8
        ys_, xs_ = np.nonzero(al)
        crop = crop[ys_.min():ys_.max()+1, xs_.min():xs_.max()+1]
        name = f"{out_prefix}_{r}_{c}"
        Image.fromarray(crop).save(f"{outdir}/{name}.png")
        res[name] = dict(w=crop.shape[1], h=crop.shape[0], x=int(x0+xs_.min()), y=int(y0+ys_.min()))
    return res

if __name__ == "__main__":
    outdir = sys.argv[1]
    r = {}
    r.update(slice_sheet(sys.argv[2], 6, 6, "b", outdir))
    r.update(slice_sheet(sys.argv[3], 8, 8, "s", outdir))
    print(json.dumps(r))
