import React, {createContext,useContext} from 'react';

export const AdminLanguage = createContext(false);
const arabic = {
  'Enter a valid URL slug, product name, and category.':'أدخلي معرّف رابط صالحاً واسم المنتج والفئة.',
  'Enter a name for every variant.':'أدخلي اسماً لكل خيار.',
  'New Product':'منتج جديد','Grid view':'عرض الشبكة','List view':'عرض القائمة','Table view':'عرض الجدول',
  'Kanban view':'عرض كانبان','Create':'إنشاء','Edit':'تعديل','Duplicate':'تكرار','Archive':'أرشفة',
  'Delete':'حذف','Publish':'نشر','Hide':'إخفاء','Back':'رجوع','Save':'حفظ','Cancel':'إلغاء',
  'Save product':'حفظ المنتج','Save as draft':'حفظ كمسودة','Save and publish':'حفظ ونشر',
  'Edit product':'تعديل المنتج','New product':'منتج جديد','Search by name or SKU':'البحث بالاسم أو رمز المنتج',
  'Search':'بحث','Search products':'البحث عن المنتجات','Find customer':'البحث عن عميل',
  'General information':'المعلومات العامة','Product images':'صور المنتج','Pricing':'التسعير',
  'Inventory':'المخزون','Variants':'الخيارات','Website preview':'معاينة الموقع',
  'URL slug':'معرّف الرابط','Name':'الاسم','Arabic name':'الاسم بالعربية','Category':'الفئة',
  'Arabic category':'الفئة بالعربية','Collection':'المجموعة','Arabic collection':'المجموعة بالعربية',
  'Description':'الوصف','Arabic description':'الوصف بالعربية','SKU or internal reference':'رمز المنتج أو المرجع الداخلي',
  'SKU':'رمز المنتج','Category name':'اسم الفئة','Add category':'إضافة فئة','Save category':'حفظ الفئة',
  'Edit category':'تعديل الفئة','Type':'النوع','Price type':'نوع السعر','Fixed price':'سعر ثابت',
  'Starting price':'السعر يبدأ من','Quote only':'عرض سعر فقط','Display price':'السعر المعروض',
  'Product gallery':'معرض صور المنتج','Variant gallery':'معرض صور الخيار','Replace image':'استبدال الصورة',
  'Set cover':'تعيين صورة الغلاف','Earlier':'السابق','Later':'التالي','Remove':'إزالة','Add variant':'إضافة خيار',
  'Variant name':'اسم الخيار','Arabic variant name':'اسم الخيار بالعربية','Variant SKU':'رمز الخيار',
  'Remove variant':'إزالة الخيار','Featured on home':'مميز في الصفحة الرئيسية','Track stock':'تتبّع المخزون',
  'Made to order':'يصنع حسب الطلب','Original price (₪)':'السعر الأصلي (₪)','Sale price (₪)':'سعر التخفيض (₪)',
  'Fixed discount (₪)':'خصم ثابت (₪)','Discount (%)':'نسبة الخصم (%)','Optional product cost (₪)':'تكلفة المنتج الاختيارية (₪)',
  'Discount starts':'بداية الخصم','Discount ends':'نهاية الخصم','Minimum price (₪)':'السعر الأدنى (₪)',
  'Stock (blank means unverified)':'المخزون (اتركيه فارغاً إذا لم يُحصَ)','Low stock threshold':'حد المخزون المنخفض',
  'Select':'تحديد','Image':'الصورة','Original':'الأصلي','Discount':'الخصم','Selling price':'سعر البيع',
  'Stock':'المخزون','Current stock':'المخزون الحالي','Set counted quantity':'تسجيل الكمية الفعلية',
  'Availability':'التوفر','Publication':'النشر','Draft':'مسودة','Published':'منشور','Hidden':'مخفي',
  'Archived':'مؤرشف','Available':'متاح','Low stock':'مخزون منخفض','Sold out':'نفد المخزون','Unverified':'غير محقق',
  'All':'الكل','Sort':'الترتيب','Price':'السعر','Show stock':'عرض المخزون','Stock movement history':'سجل حركات المخزون',
  'Product':'المنتج','Products':'المنتجات','Variant':'الخيار','Movement':'الحركة','Date':'التاريخ',
  'Action':'إجراء','Actions':'الإجراءات','Clear selection':'إلغاء التحديد','Open':'فتح','Order':'الطلب',
  'Orders':'الطلبات','Customer':'العميل','City':'المدينة','Total':'الإجمالي','State':'الحالة','Status':'الحالة',
  'Payment':'الدفع','Paid':'مدفوع','Unpaid':'غير مدفوع','Pending':'قيد الانتظار','Confirmed':'مؤكد',
  'Preparing':'قيد التجهيز','Shipped':'تم الشحن','Delivered':'تم التسليم','Cancelled':'ملغى',
  'Contact on WhatsApp':'التواصل عبر واتساب','Mark paid':'تسجيل الدفع','Export CSV':'تصدير CSV',
  'Confirmed sales':'المبيعات المؤكدة','Collected revenue':'الإيرادات المحصّلة','Outstanding COD':'مدفوعات عند الاستلام معلّقة',
  'Best sellers':'الأكثر مبيعاً','Recent orders':'الطلبات الأخيرة','Confirmed sales by order date':'المبيعات المؤكدة حسب تاريخ الطلب',
  'From':'من','To':'إلى','Today':'اليوم','Last 7 days':'آخر ٧ أيام','Last 30 days':'آخر ٣٠ يوماً',
  'New promotion':'عرض جديد','Promotion':'العرض','Scope':'النطاق','Targets':'المنتجات أو الفئات المستهدفة',
  'Entire store':'المتجر بأكمله','Categories':'الفئات','Selected products':'منتجات محددة','Discount type':'نوع الخصم',
  'Percentage':'نسبة مئوية','Fixed amount (₪)':'مبلغ ثابت (₪)','Starts':'البداية','Ends':'النهاية',
  'Active':'نشط','Save promotion':'حفظ العرض','New workshop':'ورشة جديدة','Registrations':'التسجيلات',
  'Available seats':'المقاعد المتاحة','Price (₪)':'السعر (₪)','Phone':'الهاتف','Delivery fees':'رسوم التوصيل',
  'Business phone number':'رقم هاتف النشاط','Save number':'حفظ الرقم','Save delivery area':'حفظ منطقة التوصيل',
  'Parent region':'المنطقة الرئيسية','No parent region':'بدون منطقة رئيسية','Area code':'رمز المنطقة',
  'English name':'الاسم بالإنجليزية','Add a different area':'إضافة منطقة أخرى','Yes':'نعم','No':'لا',
  'Previous':'السابق','Next':'التالي','Item':'العنصر','Quote (₪)':'عرض السعر (₪)','Save request':'حفظ الطلب',
  'Price with this promotion':'السعر مع هذا العرض','Units in stock':'الوحدات في المخزون',
  'No orders on this page.':'لا توجد طلبات في هذه الصفحة.',
  'No custom requests on this page.':'لا توجد طلبات مخصصة في هذه الصفحة.',
  'No orders in this period.':'لا توجد طلبات خلال هذه الفترة.',
  'Drop image files here or choose them above.':'اسحبي الصور هنا أو اختاريها من الحقل أعلاه.'
};

export function useAdminText() {
  const rtl = useContext(AdminLanguage);
  return text => rtl ? arabic[text] || text : text;
}

export function AdminLabel({children}) {
  const t = useAdminText();
  return t(children);
}
