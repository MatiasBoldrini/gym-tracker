export function isTimed(exercise) {
  return /["″]|\d\s*(?:s|seg(?:undos?)?|min(?:utos?)?)\b|\d+:\d+/i.test(exercise.prescription);
}

export function loadValue(value) {
  const cleaned = value.trim().replace(',', '.').replace(/\s*kg$/i, '');
  const kg = Number(cleaned);
  return /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(cleaned) && kg <= Number.MAX_SAFE_INTEGER ? kg : null;
}

// Do not alter the stored draft when displaying the unit in history or Sheets.
export function formatLoad(value) {
  const text = (value ?? "").trim();
  if (!text) return "";
  return /kg$/i.test(text) ? text.replace(/(\d)\s*kg$/i, "$1 kg") : text + " kg";
}

export function validReps(value, exercise) {
  const text = value.trim();
  if (!text) return false;
  if (/^[+-]?[\d.,]+$/.test(text)) {
    if (!/^\+?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(text)) return false;
    const n = Number(text.replace(",", "."));
    return n > 0 && n <= Number.MAX_SAFE_INTEGER && (!exercise || isTimed(exercise) || Number.isSafeInteger(n));
  }
  const range = /^(\d+)(?:\s*[-–]\s*(\d+))?\s*(?:c\/u|reps?)?$/i.exec(text);
  if (range) {
    const min = Number(range[1]), max = Number(range[2] ?? range[1]);
    return min > 0 && Number.isSafeInteger(max) && max >= min;
  }
  const duration = /^(\d+(?:[.,]\d+)?)\s*(?:["″]|s|seg(?:undos?)?|min(?:utos?)?)$/i.exec(text);
  if (duration) {
    const n = Number(duration[1].replace(",", "."));
    return n > 0 && n <= Number.MAX_SAFE_INTEGER && (!exercise || isTimed(exercise));
  }
  const clock = /^(\d+):([0-5]\d)$/.exec(text);
  if (clock) {
    const seconds = Number(clock[1]) * 60 + Number(clock[2]);
    return seconds > 0 && Number.isSafeInteger(seconds) && (!exercise || isTimed(exercise));
  }
  // Retain older free-text records and prescriptions such as “al fallo”.
  return !exercise || (!/^[-—]$/.test(text) && text === exercise.prescription.trim().replace(/^\d+\s*[x×]\s*/i, ""));
}
