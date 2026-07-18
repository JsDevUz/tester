import { X, Radio, Users, Clock, Mic, Trophy, Crown } from "lucide-react";

// "Jonli musobaqa yaratish" modalidagi (i) tugmasi bilan ochiladi — o'qituvchi
// birinchi marta jonli musobaqa tashkil qilayotganda butun jarayonni
// (PIN, yakka/jamoaviy rejim, ovoz) tushunishi uchun qisqa qo'llanma.
export function LiveSessionInfoModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-60 bg-black/30 flex items-end sm:items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          <div className="flex items-center gap-2">
            <Radio size={20} className="text-gray-700" />
            <h2 className="text-lg font-bold text-gray-800">
              Jonli musobaqa qanday tashkillashtiriladi?
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 pb-6 flex flex-col gap-5 mt-3">
          <section className="flex gap-3">
            <div className="shrink-0 w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Radio size={17} />
            </div>
            <div>
              <p className="font-semibold text-gray-800 text-sm mb-1">
                1. Test tanlab, sessiya yarating
              </p>
              <p className="text-sm text-gray-500 leading-relaxed">
                Faqat yakka/ko'p tanlovli, to'g'ri-noto'g'ri kabi turdagi
                savollari bor testlar jonli musobaqaga mos keladi. Sessiya
                yaratilgach, 6 xonali <strong>PIN kod</strong> beriladi.
              </p>
            </div>
          </section>

          <section className="flex gap-3">
            <div className="shrink-0 w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Users size={17} />
            </div>
            <div>
              <p className="font-semibold text-gray-800 text-sm mb-1">
                2. O'quvchilar PIN orqali qo'shiladi
              </p>
              <p className="text-sm text-gray-500 leading-relaxed">
                O'quvchilar "Jonli musobaqaga qo'shilish" sahifasida shu PIN
                kodni kiritib, ism bilan lobbyga kiradi. Siz (ustoz) ularning
                ro'yxatini real vaqtda ko'rib turasiz.
              </p>
            </div>
          </section>

          <section className="flex gap-3">
            <div className="shrink-0 w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Crown size={17} />
            </div>
            <div>
              <p className="font-semibold text-gray-800 text-sm mb-1">
                3. Rejimni tanlang: Yakka yoki Jamoaviy
              </p>
              <p className="text-sm text-gray-500 leading-relaxed">
                <strong>Yakka</strong> rejimda har bir o'quvchi mustaqil javob
                beradi. <strong>Jamoaviy</strong> rejimda o'quvchilarni
                guruhlarga bo'lib, har guruhga bitta <strong>sardor</strong>{" "}
                tayinlaysiz — guruh a'zolari variant taklif qiladi, sardor esa
                yakuniy javobni yuboradi. Jamoaviy o'yin uchun kamida 2 ta
                guruh va har birida sardor kerak.
              </p>
            </div>
          </section>

          <section className="flex gap-3">
            <div className="shrink-0 w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Clock size={17} />
            </div>
            <div>
              <p className="font-semibold text-gray-800 text-sm mb-1">
                4. Savol vaqtini belgilang
              </p>
              <p className="text-sm text-gray-500 leading-relaxed">
                Har savolga 10, 20, 30 yoki 60 soniya berilishi mumkin. Barcha
                (yoki jamoaviy rejimda barcha sardorlar) javob bergach, vaqt
                tugashini kutmasdan darhol natija ko'rsatiladi.
              </p>
            </div>
          </section>

          <section className="flex gap-3">
            <div className="shrink-0 w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Mic size={17} />
            </div>
            <div>
              <p className="font-semibold text-gray-800 text-sm mb-1">
                5. Ovozli muloqot
              </p>
              <p className="text-sm text-gray-500 leading-relaxed">
                Musobaqa davomida barcha ishtirokchilar (ustoz va o'quvchilar)
                mikrofon orqali gaplashishi mumkin — ekranning pastida
                mikrofon tugmasi chiqadi. Kerak bo'lmasa, mikrofonni istalgan
                vaqt o'chirib qo'yish mumkin.
              </p>
            </div>
          </section>

          <section className="flex gap-3">
            <div className="shrink-0 w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Trophy size={17} />
            </div>
            <div>
              <p className="font-semibold text-gray-800 text-sm mb-1">
                6. Yakuniy natijalar
              </p>
              <p className="text-sm text-gray-500 leading-relaxed">
                Barcha savollar tugagach (yoki siz "Sessiyani tugatish"ni
                bossangiz), reyting jadvali chiqadi va natijalar avtomatik
                saqlanadi — keyinroq tarix bo'limidan ko'rish mumkin.
              </p>
            </div>
          </section>

          <button
            onClick={onClose}
            className="w-full py-3.5 bg-gray-900 text-white rounded-2xl font-semibold text-sm hover:bg-gray-800 transition-colors mt-1"
          >
            Tushunarli
          </button>
        </div>
      </div>
    </div>
  );
}
