/**
 * โครงหน้าจอระหว่างรอข้อมูล
 *
 * ทุกหน้าอ่านข้อมูลสดจากเซิร์ฟเวอร์ ถ้าไม่มีไฟล์นี้ กดปุ่มแล้วหน้าจอจะนิ่งสนิท
 * จนกว่าเซิร์ฟเวอร์จะตอบ คนใช้เลยนึกว่ากดไม่ติดแล้วกดซ้ำ
 * Next แสดงไฟล์นี้ทันทีที่กด และยังทำให้ prefetch ทำงานได้ด้วย
 */
export default function Loading() {
  return (
    <div className="app-frame animate-pulse px-4 pb-28 pt-8" aria-busy="true" aria-label="กำลังโหลด">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-full bg-black/5" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-1/2 rounded bg-black/5" />
          <div className="h-3 w-1/3 rounded bg-black/5" />
        </div>
      </div>

      <div className="mt-7 grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card h-28" />
        ))}
      </div>

      <div className="mt-5 space-y-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card h-16" />
        ))}
      </div>
    </div>
  );
}
