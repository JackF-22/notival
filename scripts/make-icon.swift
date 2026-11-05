import AppKit

let size = 1024
let image = NSImage(size: NSSize(width: size, height: size))
image.lockFocus()
let bounds = NSRect(x: 0, y: 0, width: size, height: size)
let field = NSBezierPath(roundedRect: bounds.insetBy(dx: 22, dy: 22), xRadius: 236, yRadius: 236)
NSColor(calibratedRed: 0.12, green: 0.12, blue: 0.30, alpha: 1).setFill()
field.fill()
let margin = NSBezierPath()
margin.lineWidth = 44
margin.lineCapStyle = .round
margin.move(to: NSPoint(x: 258, y: 218))
margin.line(to: NSPoint(x: 258, y: 806))
NSColor(calibratedRed: 0.98, green: 0.52, blue: 0.57, alpha: 1).setStroke()
margin.stroke()
let m = NSBezierPath()
m.lineWidth = 76
m.lineCapStyle = .round
m.lineJoinStyle = .round
m.move(to: NSPoint(x: 380, y: 310))
m.line(to: NSPoint(x: 380, y: 702))
m.line(to: NSPoint(x: 520, y: 492))
m.line(to: NSPoint(x: 660, y: 702))
m.line(to: NSPoint(x: 660, y: 310))
NSColor(calibratedRed: 0.56, green: 0.52, blue: 1, alpha: 1).setStroke()
m.stroke()
NSColor(calibratedRed: 0.30, green: 0.85, blue: 0.82, alpha: 1).setFill()
NSBezierPath(ovalIn: NSRect(x: 782, y: 717, width: 75, height: 75)).fill()
image.unlockFocus()
guard let tiff = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let png = bitmap.representation(using: .png, properties: [:]) else { fatalError("Could not render icon") }
try png.write(to: URL(fileURLWithPath: CommandLine.arguments[1]), options: .atomic)
