// لا نعرض أعمالًا تجريبية كأنها محتوى حقيقي. يتم ملء الكتالوج من Supabase.
let WORKS = [];
window.GALAXITE_SET_WORKS = (rows) => { WORKS = Array.isArray(rows) ? rows : []; };
