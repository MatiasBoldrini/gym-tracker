const APPS_SCRIPT_URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL || "";

export async function saveExerciseSets(
    weekId: number,
    dayId: number,
    exerciseName: string,
    sets: { weight: number; reps: number }[],
) {
    if (!APPS_SCRIPT_URL) {
        console.warn("Apps Script URL not configured. Data not saved to Sheet.");
        return;
    }

    try {
        const response = await fetch(APPS_SCRIPT_URL, {
            method: "POST",
            mode: "no-cors", // Apps Script redirects can cause CORS issues, no-cors handles the submission
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                weekId,
                dayId,
                exerciseName,
                sets,
            }),
        });
        return response;
    } catch (error) {
        console.error("Error saving to Sheets:", error);
        throw error;
    }
}


