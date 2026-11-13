// Stories that come with the app, by language code. Each sentence is t (the language), n (English), and the other
// wordings that are also right (tAlt / nAlt). Your own stories live in state.stories.
const StoriesData=(()=>{
 const s=(t,n,nAlt=[],tAlt=[])=>({t,n,nAlt,tAlt});
 const list={
  ru:[
   {id:'ru-morning',title:'Моё утро · My morning',level:'A1',sentences:[
    s('Меня зовут Анна.','My name is Anna.',['I am called Anna.',"I'm Anna."]),
    s('Я живу в Москве.','I live in Moscow.'),
    s('Каждое утро я пью чай.','Every morning I drink tea.',['I drink tea every morning.'],['Я пью чай каждое утро.']),
    s('Потом я иду на работу.','Then I go to work.',['Then I walk to work.','Then I am going to work.']),
    s('Я работаю в школе.','I work at a school.',['I work in a school.']),
    s('Вечером я читаю книгу.','In the evening I read a book.',['I read a book in the evening.','In the evening I am reading a book.'],['Я читаю книгу вечером.']),
    s('Я люблю свой город.','I love my city.',['I like my city.','I love my town.'])]},
   {id:'ru-cat',title:'Кошка Мурка · Murka the cat',level:'A1',sentences:[
    s('У Маши есть кошка.','Masha has a cat.',['Masha has a pet cat.']),
    s('Кошку зовут Мурка.','The cat is called Murka.',["The cat's name is Murka.",'The cat is named Murka.']),
    s('Мурка любит молоко.','Murka loves milk.',['Murka likes milk.']),
    s('Утром Маша даёт ей молоко.','In the morning Masha gives her milk.',['Masha gives her milk in the morning.','In the morning Masha gives her some milk.'],['Маша даёт ей молоко утром.']),
    s('Но сегодня молока нет.','But today there is no milk.',["But today there isn't any milk.",'But there is no milk today.','But today there is not any milk.']),
    s('Маша идёт в магазин.','Masha goes to the store.',['Masha goes to the shop.','Masha is going to the store.','Masha is going to the shop.']),
    s('Она покупает молоко и хлеб.','She buys milk and bread.',['She is buying milk and bread.']),
    s('Мурка очень рада.','Murka is very happy.',['Murka is very glad.'])]},
   {id:'ru-trip',title:'Поездка в Петербург · A trip to Petersburg',level:'A2',sentences:[
    s('Прошлым летом мы поехали в Санкт-Петербург.','Last summer we went to Saint Petersburg.',['Last summer we went to St. Petersburg.','Last summer we travelled to Saint Petersburg.','Last summer we traveled to Saint Petersburg.','Last summer we travelled to St. Petersburg.','Last summer we traveled to St. Petersburg.']),
    s('Мы ехали на поезде всю ночь.','We travelled by train all night.',['We traveled by train all night.','We rode the train all night.','We went by train all night.','We were on the train all night.']),
    s('Утром мы увидели красивый город.','In the morning we saw a beautiful city.',['We saw a beautiful city in the morning.','In the morning we saw a lovely city.']),
    s('Мы гуляли по набережной и фотографировали мосты.','We walked along the embankment and photographed the bridges.',['We walked along the embankment and took photos of the bridges.','We strolled along the embankment and photographed the bridges.','We walked along the embankment and took pictures of the bridges.']),
    s('Днём мы были в музее.','In the afternoon we were at the museum.',['In the afternoon we were in the museum.','We were at the museum in the afternoon.','During the day we were at the museum.']),
    s('Там было много туристов.','There were a lot of tourists there.',['There were many tourists there.','There were lots of tourists there.']),
    s('Вечером мы ужинали в маленьком кафе.','In the evening we had dinner in a small cafe.',['In the evening we had dinner in a small café.','In the evening we ate dinner in a small cafe.','We had dinner in a small cafe in the evening.']),
    s('Это была лучшая поездка в моей жизни!','It was the best trip of my life!',['That was the best trip of my life!','It was the best trip in my life!','This was the best trip of my life!'])]}
  ],
  es:[
   {id:'es-day',title:'Un día en Madrid · A day in Madrid',level:'A1',sentences:[
    s('Me llamo Carlos y vivo en Madrid.','My name is Carlos and I live in Madrid.',["I'm called Carlos and I live in Madrid.",'I am called Carlos and I live in Madrid.']),
    s('Todas las mañanas tomo un café.','Every morning I have a coffee.',['Every morning I drink a coffee.','Every morning I have coffee.','Every morning I drink coffee.']),
    s('Luego camino al trabajo.','Then I walk to work.',['Later I walk to work.','Then I walk to the office.']),
    s('Trabajo en una oficina pequeña.','I work in a small office.',['I work at a small office.']),
    s('A las dos como con mis amigos.','At two o’clock I eat with my friends.',['At two I eat with my friends.','At two I have lunch with my friends.','At two I eat lunch with my friends.']),
    s('Por la tarde estudio inglés.','In the afternoon I study English.',['In the afternoon I am studying English.','I study English in the afternoon.']),
    s('Me gusta mi ciudad.','I like my city.',['I love my city.','I like my town.'])]}
  ]
 };
 return {list,forLanguage:code=>list[code]||[]};
})();
if(typeof module!=='undefined')module.exports=StoriesData;
