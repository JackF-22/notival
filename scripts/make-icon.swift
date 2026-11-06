import AppKit

// Production vector geometry matching web/mark.svg. The two folded tabs form n.
let size = 1024
let image = NSImage(size: NSSize(width: size, height: size))
image.lockFocus()
let transform = NSAffineTransform()
transform.translateX(by: 0, yBy: CGFloat(size))
transform.scaleX(by: 8, yBy: -8)
transform.concat()
func color(_ red: CGFloat, _ green: CGFloat, _ blue: CGFloat) -> NSColor {
 NSColor(calibratedRed:red/255,green:green/255,blue:blue/255,alpha:1)
}
func fill(_ path: NSBezierPath, _ from: NSColor, _ to: NSColor) {
 NSGradient(starting:from,ending:to)!.draw(in:path,angle:70)
}
let field = NSBezierPath(roundedRect:NSRect(x:7,y:7,width:114,height:114),xRadius:26,yRadius:26)
fill(field,color(43,55,66),color(20,30,39))
let blue=NSBezierPath()
blue.move(to:NSPoint(x:24,y:93));blue.line(to:NSPoint(x:24,y:46))
blue.curve(to:NSPoint(x:30,y:35),controlPoint1:NSPoint(x:24,y:41),controlPoint2:NSPoint(x:25,y:38))
blue.line(to:NSPoint(x:58,y:19))
blue.curve(to:NSPoint(x:72,y:28),controlPoint1:NSPoint(x:67,y:14),controlPoint2:NSPoint(x:72,y:16))
blue.line(to:NSPoint(x:72,y:59))
blue.curve(to:NSPoint(x:51,y:59),controlPoint1:NSPoint(x:64,y:54),controlPoint2:NSPoint(x:56,y:54))
blue.curve(to:NSPoint(x:48,y:69),controlPoint1:NSPoint(x:48,y:62),controlPoint2:NSPoint(x:48,y:64))
blue.line(to:NSPoint(x:48,y:79));blue.close()
fill(blue,color(57,121,255),color(36,85,217))
let mint=NSBezierPath()
mint.move(to:NSPoint(x:70,y:108));mint.line(to:NSPoint(x:70,y:70))
mint.curve(to:NSPoint(x:60,y:56),controlPoint1:NSPoint(x:70,y:63),controlPoint2:NSPoint(x:67,y:59))
mint.curve(to:NSPoint(x:55,y:55),controlPoint1:NSPoint(x:58,y:55),controlPoint2:NSPoint(x:57,y:55))
mint.line(to:NSPoint(x:91,y:34))
mint.curve(to:NSPoint(x:104,y:43),controlPoint1:NSPoint(x:100,y:29),controlPoint2:NSPoint(x:104,y:31))
mint.line(to:NSPoint(x:104,y:82))
mint.curve(to:NSPoint(x:99,y:90),controlPoint1:NSPoint(x:104,y:86),controlPoint2:NSPoint(x:103,y:87))
mint.close()
fill(mint,color(138,224,180),color(88,190,156))
image.unlockFocus()
guard let tiff=image.tiffRepresentation,let bitmap=NSBitmapImageRep(data:tiff),let png=bitmap.representation(using:.png,properties:[:]) else{fatalError("Could not render Notival icon")}
try png.write(to:URL(fileURLWithPath:CommandLine.arguments[1]),options:.atomic)
