/* Icons a subject can wear. One line per icon: the emoji, then its name and any words people might search for. */
const IconLibrary=(()=>{
 const sets={
  'Study & organization':`📁 Folder files
📂 Open folder
🗂️ File dividers organize
🗃️ Card file box archive
🗄️ File cabinet
📚 Books library
📖 Open book reading
📕 Closed book red
📗 Closed book green
📘 Closed book blue
📙 Closed book orange
📓 Notebook
📔 Decorated notebook
📒 Ledger
📝 Notes memo writing
📄 Page document
📃 Page curl
📑 Bookmark tabs
🔖 Bookmark
🏷️ Label tag
📌 Pin
📍 Round pushpin location
📎 Paperclip attach
🖇️ Linked paperclips
📋 Clipboard checklist
✅ Check done complete
☑️ Checked box
🗓️ Calendar schedule
📅 Date calendar
⏰ Alarm clock deadline
⏳ Hourglass time
⏱️ Stopwatch timer
🎯 Target goal
🏆 Trophy achievement
🥇 First place medal
🎖️ Medal honor
🧾 Receipt
🔍 Magnifying glass search research
🔎 Search right
🗒️ Spiral notepad
✂️ Scissors
📏 Ruler
🖊️ Pen
🖍️ Crayon highlight
🧷 Safety pin
📦 Package box
🗑️ Wastebasket
🔒 Lock private
🔑 Key
🏫 School
🎓 Graduation cap degree
🎒 Backpack school bag
🧑‍🏫 Teacher professor lecture
🧑‍🎓 Student
📣 Megaphone announcement
🔔 Bell reminder`,
  'Science & nature':`🔬 Microscope biology
🧬 DNA genetics
🧪 Test tube chemistry
⚗️ Alembic distillation chemistry
🧫 Petri dish culture
🦠 Microbe bacteria virus microbiology
💉 Syringe vaccine
💊 Pill pharmacology medicine
🩺 Stethoscope medicine clinical
🩻 X-ray radiology
🩸 Blood drop
🔭 Telescope astronomy
⚛️ Atom physics
🧲 Magnet magnetism
⚡ Lightning electricity
🔋 Battery energy
💡 Light bulb idea optics
🌡️ Thermometer temperature thermodynamics
☢️ Radioactive nuclear
☣️ Biohazard
🌱 Seedling plant growth
🌿 Herb leaf botany
🍃 Leaves wind
🌾 Grain agriculture
🌳 Tree forest ecology
🌲 Evergreen
🌴 Palm tree tropical
🌵 Cactus desert
🍄 Mushroom fungi
🌸 Blossom flower
🌻 Sunflower
🪴 Potted plant
🌍 Earth Europe Africa
🌎 Earth Americas
🌏 Earth Asia
🌋 Volcano geology
⛰️ Mountain
🏔️ Snow mountain glacier
🪨 Rock mineral geology
💎 Gem crystal mineral
🌊 Ocean wave oceanography
💧 Droplet water hydrology
❄️ Snowflake
☁️ Cloud meteorology
🌧️ Rain
⛈️ Thunderstorm
🌪️ Tornado
🌈 Rainbow
🌅 Sunrise
☀️ Sun
🌙 Moon
🌕 Full moon
🌑 New moon
🪐 Planet Saturn astronomy
🌌 Milky Way galaxy cosmos
☄️ Comet
✨ Sparkles
🔥 Fire combustion
🧠 Brain neuroscience psychology
🫀 Heart anatomy cardiology
🫁 Lungs respiratory
🦴 Bone anatomy skeleton
🦷 Tooth dentistry
👁️ Eye vision
👂 Ear hearing
🧍 Human body
🐛 Bug entomology insect
🦋 Butterfly
🐝 Bee
🐜 Ant
🕷️ Spider
🐟 Fish marine biology
🐠 Tropical fish
🐙 Octopus
🦈 Shark
🐋 Whale
🐢 Turtle reptile
🐍 Snake herpetology
🦎 Lizard
🐸 Frog amphibian
🐦 Bird ornithology
🦉 Owl
🐘 Elephant
🦁 Lion
🐺 Wolf
🐻 Bear
🐒 Monkey primate
🦴 Fossil bones paleontology
🦕 Dinosaur paleontology
🥚 Egg
🐾 Paw prints zoology animals`,
  'Math & technology':`🧮 Abacus arithmetic
📐 Triangle ruler geometry
📏 Straight ruler measurement
➕ Plus addition
➖ Minus subtraction
✖️ Multiply
➗ Divide
♾️ Infinity calculus
🟰 Equals algebra
🔢 Numbers
🔣 Symbols
🔡 Lowercase letters
🔠 Uppercase letters
📊 Bar chart statistics
📈 Rising chart growth
📉 Falling chart decline
💻 Laptop computer
🖥️ Desktop computer
⌨️ Keyboard
🖱️ Mouse
🖨️ Printer
📱 Phone mobile
📡 Satellite dish signal
🛰️ Satellite
🤖 Robot AI robotics
🧑‍💻 Programmer developer coding
👾 Alien game pixel
🕹️ Joystick
🎮 Video games controller
💾 Floppy disk data
💿 Optical disc
📀 DVD
🔌 Plug electronics
🔦 Flashlight
🔭 Telescope
⚙️ Gear engineering
🔧 Wrench
🔩 Nut and bolt
🛠️ Hammer and wrench tools
⛏️ Pick mining
🧰 Toolbox
🪛 Screwdriver
🔨 Hammer
🏗️ Construction crane
🏭 Factory industry manufacturing
🚧 Roadwork
🧱 Brick materials
🪜 Ladder
🔐 Locked with key security
🛡️ Shield cybersecurity
🌐 Globe network internet
📶 Signal bars
🔗 Link chain
🧩 Puzzle piece algorithms
🎲 Dice probability
♟️ Chess strategy
🧿 Pattern
⚖️ Balance scale
🧊 Cube
🔺 Triangle
🔵 Circle
🟦 Square
⬡ Hexagon
💠 Diamond
🌀 Spiral cyclone
〰️ Wave
📟 Pager
🧯 Fire extinguisher safety`,
  'Humanities & society':`📜 Scroll history
🏛️ Classical building government civics
🏺 Amphora archaeology ancient
🗿 Moai ancient statue
⚱️ Funeral urn
🏰 Castle medieval
🏯 Japanese castle
🕌 Mosque
⛪ Church
🕍 Synagogue
🛕 Hindu temple
⛩️ Shinto shrine
🕋 Kaaba
☮️ Peace
☯️ Yin yang philosophy
✝️ Cross religion
☪️ Star and crescent
🕉️ Om
✡️ Star of David
🪬 Hamsa
🗺️ World map geography
🧭 Compass navigation
🌐 Global studies
🏳️ White flag
🏴 Black flag
🚩 Red flag
🎌 Crossed flags
⚖️ Law justice
👨‍⚖️ Judge court
🗳️ Ballot box politics voting
🏦 Bank finance
💰 Money bag economics
💵 Dollar banknote
💶 Euro
💷 Pound
💴 Yen
💳 Credit card
🪙 Coin
📈 Markets
💼 Briefcase business career
🏢 Office building
🏪 Store retail
🛒 Shopping cart commerce
🤝 Handshake collaboration negotiation
👥 People sociology
👪 Family
🧑‍🤝‍🧑 People holding hands community
🗣️ Speaking language
💬 Speech bubble communication
💭 Thought bubble philosophy
🗨️ Speech
📰 Newspaper journalism media
🗞️ Rolled newspaper
📢 Loudspeaker
📺 Television media
📻 Radio
🎙️ Microphone podcast
📖 Literature
🖋️ Fountain pen
✒️ Black nib
🪶 Feather quill
📮 Postbox
✉️ Envelope letter
🔤 ABC alphabet linguistics
🈁 Japanese
🇬🇧 English UK
🇺🇸 English US
🇫🇷 French
🇪🇸 Spanish
🇩🇪 German
🇮🇹 Italian
🇨🇳 Chinese
🇯🇵 Japanese flag
🇰🇷 Korean
🇷🇺 Russian
🇧🇷 Portuguese Brazil
🇮🇳 Hindi India
🇸🇦 Arabic
🇬🇷 Greek
🕰️ Mantelpiece clock history
⚔️ Crossed swords war military history
🛡️ Shield defense
🏹 Bow and arrow
💣 Bomb
🎖️ Military medal
⚓ Anchor maritime
⛵ Sailboat exploration
🏴‍☠️ Pirate flag
🧑‍⚖️ Lawyer
🧑‍🔬 Scientist
🧑‍⚕️ Health worker
🧑‍🌾 Farmer
🧑‍🍳 Chef
🧑‍🎨 Artist
🧑‍🚀 Astronaut
🧑‍🏭 Factory worker
🧑‍💼 Office worker
🧑‍🔧 Mechanic
🧑‍✈️ Pilot
👮 Police criminology
💡 Idea`,
  'Arts & creativity':`🎨 Art palette
🖌️ Paintbrush painting
🖼️ Framed picture
🎭 Theater drama masks
🎬 Clapper board film
🎥 Movie camera
📽️ Film projector
🎞️ Film frames
📷 Camera photography
📸 Camera flash
🎞️ Cinema
🎵 Musical note music
🎶 Musical notes
🎼 Musical score theory
🎹 Piano keyboard
🎸 Guitar
🪕 Banjo
🎻 Violin strings
🎺 Trumpet
🎷 Saxophone jazz
🥁 Drum percussion
🪘 Long drum
🪗 Accordion
🪈 Flute
🎤 Microphone singing vocals
🎧 Headphones listening
📻 Radio broadcast
💃 Dancer dance
🕺 Man dancing
🩰 Ballet shoes
✍️ Writing hand
📝 Creative writing
📚 Literature reading
🧵 Thread textiles sewing
🪡 Needle embroidery
🧶 Yarn knitting crochet
👗 Dress fashion
👔 Tie clothing
👠 High heel shoe
🧥 Coat
👒 Hat
💍 Ring jewelry
💄 Lipstick makeup
✂️ Cutting craft
🪞 Mirror
🏺 Pottery ceramics
🗿 Sculpture
🖍️ Drawing crayon
✏️ Pencil sketch
📐 Drafting design
🏛️ Architecture
🏠 House design
🛋️ Interior design couch
🪑 Chair furniture
🎪 Circus tent
🎠 Carousel
🎡 Ferris wheel
🎢 Roller coaster
🃏 Joker card
🎴 Flower cards
🀄 Mahjong
🎰 Slot machine
🪄 Magic wand
🔮 Crystal ball
🎩 Top hat magician
🎈 Balloon
🎉 Party popper celebration
🎁 Gift
🎀 Ribbon bow
🪅 Piñata
🎊 Confetti`,
  'Health, sport & wellness':`🏃 Running track
🚴 Cycling
🏊 Swimming
🤸 Gymnastics
🏋️ Weightlifting
🧘 Yoga meditation
🤼 Wrestling
🥋 Martial arts karate
🥊 Boxing
🤺 Fencing
🧗 Climbing
🏄 Surfing
⛷️ Skiing
🏂 Snowboarding
⛸️ Ice skating
🛹 Skateboard
🚣 Rowing
🏇 Horse riding
⚽ Soccer football
🏀 Basketball
🏈 American football
⚾ Baseball
🥎 Softball
🎾 Tennis
🏐 Volleyball
🏉 Rugby
🏸 Badminton
🏓 Table tennis ping pong
🏒 Ice hockey
🏑 Field hockey
🥍 Lacrosse
🏏 Cricket
⛳ Golf
🎳 Bowling
🏹 Archery
🎣 Fishing
🤿 Diving
🥅 Goal net
🛼 Roller skate
🪁 Kite
🏅 Sports medal
🍎 Apple nutrition
🍏 Green apple
🍊 Orange fruit
🍌 Banana
🍇 Grapes
🍓 Strawberry
🥑 Avocado
🥦 Broccoli vegetables
🥕 Carrot
🌽 Corn
🥗 Salad
🍞 Bread baking
🧀 Cheese
🍳 Egg cooking
🍽️ Plate dining
🥄 Spoon
🔪 Knife kitchen
🍲 Stew cooking
🍕 Pizza
🍜 Noodles ramen
🍣 Sushi
🍰 Cake pastry
☕ Coffee
🍵 Tea
🥤 Cup with straw
💧 Hydration water
🛌 Sleep bed rest
🧴 Lotion skincare
🪥 Toothbrush
🧼 Soap hygiene
💆 Massage
🧠 Mental health
❤️ Heart love
🩹 Bandage first aid
🦽 Wheelchair accessibility
🏥 Hospital
🚑 Ambulance emergency
🧑‍⚕️ Doctor nurse`,
  'Places & travel':`🏠 House home
🏡 House with garden
🏘️ Houses neighborhood
🏙️ Cityscape urban
🌆 City sunset
🌃 Night city
🌉 Bridge at night
🌁 Foggy
🗽 Statue of Liberty
🗼 Tokyo Tower
🗻 Mount Fuji
🏝️ Island
🏜️ Desert
🏕️ Camping
⛺ Tent
🏞️ National park
🛤️ Railway
🛣️ Highway
✈️ Airplane travel aviation
🛫 Takeoff
🛬 Landing
🚀 Rocket space
🛸 Flying saucer
🚁 Helicopter
🪂 Parachute
🚂 Train locomotive
🚆 Train
🚇 Metro
🚌 Bus
🚗 Car automotive
🏎️ Racing car
🚕 Taxi
🚚 Truck logistics
🚜 Tractor farming
🏍️ Motorcycle
🚲 Bicycle
🛴 Scooter
🚢 Ship
⛴️ Ferry
🛶 Canoe
⛽ Fuel pump
🚦 Traffic light
🧳 Luggage trip
🎫 Ticket
🗺️ Map
📍 Location
🧭 Navigation
🌐 World`,
  'Symbols & colors':`⭐ Star favorite
🌟 Glowing star
💫 Dizzy star
✨ Sparkle
❤️ Red heart
🧡 Orange heart
💛 Yellow heart
💚 Green heart
💙 Blue heart
💜 Purple heart
🖤 Black heart
🤍 White heart
🤎 Brown heart
🩷 Pink heart
🔴 Red circle
🟠 Orange circle
🟡 Yellow circle
🟢 Green circle
🔵 Blue circle
🟣 Purple circle
🟤 Brown circle
⚫ Black circle
⚪ White circle
🟥 Red square
🟧 Orange square
🟨 Yellow square
🟩 Green square
🟦 Blue square
🟪 Purple square
◆ Diamond
◇ Open diamond
■ Black square
● Black circle shape
▲ Triangle up
★ Star shape
♠️ Spade
♥️ Heart suit
♦️ Diamond suit
♣️ Club
❓ Question
❗ Exclamation
💯 Hundred
🆕 New
🔝 Top
🔰 Beginner
♻️ Recycle sustainability
⚠️ Warning
🔱 Trident
⚜️ Fleur-de-lis
☘️ Shamrock
🍀 Four leaf clover luck
🌐 Globe
💎 Gem
🔆 Bright
🌗 Half moon
🪩 Disco ball`
 };
 const groups={};
 for(const [name,block] of Object.entries(sets)){
  const seen=new Set();
  groups[name]=block.split('\n').map(line=>{const i=line.indexOf(' ');return [line.slice(0,i),line.slice(i+1)]}).filter(([emoji,label])=>emoji&&label&&!seen.has(emoji)&&seen.add(emoji));
 }
 const all=()=>{const seen=new Set();return Object.entries(groups).flatMap(([group,icons])=>icons.filter(([emoji])=>!seen.has(emoji)&&seen.add(emoji)).map(([emoji,label])=>({emoji,label,group})))};
 function search(query){
  const words=String(query||'').toLowerCase().split(/\s+/).filter(Boolean);
  if(!words.length)return all();
  return all().filter(icon=>{const text=(icon.label+' '+icon.group).toLowerCase();return words.every(word=>text.includes(word))});
 }
 return {groups,all,search,names:()=>Object.keys(groups)};
})();
