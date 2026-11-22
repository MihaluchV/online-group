/* Спільна практична · запуск: сторінка вчителя (?teacher) або учня
   Звичайний скрипт (не модуль): усі файли мають спільну глобальну область видимості; порядок підключення — в index.html. */
(async function start(){
  if(Q.has('teacher')||Q.has('t'))return teacherMain();
  return studentMain()})();
