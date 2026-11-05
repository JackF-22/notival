"""Pack PNG icon sizes into the standard ICNS PNG records."""
from pathlib import Path
import struct
import sys

iconset = Path(sys.argv[1])
output = Path(sys.argv[2])
sizes = [
    ("icp4", "icon_16x16.png"),
    ("icp5", "icon_32x32.png"),
    ("icp6", "icon_32x32@2x.png"),
    ("ic07", "icon_128x128.png"),
    ("ic08", "icon_256x256.png"),
    ("ic09", "icon_512x512.png"),
    ("ic10", "icon_512x512@2x.png"),
]
records = []
for kind, name in sizes:
    png = (iconset / name).read_bytes()
    records.append(kind.encode("ascii") + struct.pack(">I", len(png) + 8) + png)
data = b"".join(records)
output.write_bytes(b"icns" + struct.pack(">I", len(data) + 8) + data)
