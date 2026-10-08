#!/usr/bin/env python3
"""Produce an original 1600x900 Marseille editorial cover using only Python stdlib."""
import math, struct, zlib, pathlib
W,H=1600,900
rows=[]
for y in range(H):
    row=bytearray()
    for x in range(W):
        if y<515:
            t=y/515
            c=(int(28+205*t),int(70+105*t),int(115+40*t))
            sun=(x-1170)**2+(y-305)**2<86**2
            if sun: c=(255,224,163)
        elif y<660:
            t=(y-515)/145
            c=(int(51-15*t),int(129-45*t),int(153-40*t))
        else:
            t=(y-660)/240
            c=(int(25+20*t),int(75+15*t),int(97+7*t))
        # Waterfront blocks and lit windows, original stylized illustration.
        if 340<y<660:
            block=(x//97)
            top=355+(block*43%160)
            if y>top and y<615:
                c=[(231,181,136),(211,141,111),(240,202,159),(192,120,98)][block%4]
                if x%97<5 or (y-top)%62<5: c=(123,91,91)
                if (x%97-15)%35<14 and (y-top-17)%57<25: c=(74,95,111)
        if 590<y<608: c=(244,206,157)
        if y>680 and (x+y//3)%175<4: c=(74,135,151)
        row.extend(c)
    rows.append(b'\0'+row)
def chunk(tag,data):return struct.pack('!I',len(data))+tag+data+struct.pack('!I',zlib.crc32(tag+data)&0xffffffff)
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',W,H,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(rows),8))+chunk(b'IEND',b'')
out=pathlib.Path('/site/en/news/ruby-lilou-marseille-opening/hero.png')
out.write_bytes(png)
print('DISCOVER_IMAGE_OK',out,len(png),W,H)
