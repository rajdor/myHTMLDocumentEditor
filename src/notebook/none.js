/* ---------- no notebook ----------
   The editor on its own has no notebook explorer. The shared code asks the same questions in both programs;
   here every answer is "no", so New, Open and Save behave exactly as they always have. */
const NB = { init() { }, on: () => false, page: () => false, foreign: () => false, textOn: () => false, leave: async () => true, detach() { }, newPage() { }, savePage() { }, warnOff() { } };
