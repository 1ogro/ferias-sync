import { nowInSP, mondayOfWeekSP, spWallClockToUTC } from "../_shared/date.ts";

/** Reclassify only when the destination run AND question have been resolved. */
export async function resolveExpectedRunAndQuestion(
  supabase: any,
  runId: string,
  questionId: string,
  now = new Date(),
): Promise<{ runId: string; questionId: string }> {
  const original = { runId, questionId };
  try {
    const { data: run, error: runError } = await supabase.from("pulse_runs")
      .select("id, survey_id, survey:pulse_surveys(id,title)").eq("id", runId).maybeSingle();
    if (runError) throw runError;
    const currentTitle = run?.survey?.title;
    const CHECKIN = "Check-in semanal de bem-estar";
    const CHECKOUT = "Check-out semanal";
    if (currentTitle !== CHECKIN && currentTitle !== CHECKOUT) return original;
    const dow = nowInSP(now).dow;
    const expectedTitle = dow >= 1 && dow <= 4 ? CHECKIN : CHECKOUT;
    if (currentTitle === expectedTitle) return original;

    const { data: survey, error: surveyError } = await supabase.from("pulse_surveys")
      .select("id").eq("title", expectedTitle).maybeSingle();
    if (surveyError || !survey?.id) throw surveyError ?? new Error("Destination survey missing");

    // Resolve the question BEFORE creating a run. Never read pulse_questions.kind.
    const { data: source, error: sourceError } = await supabase.from("pulse_questions")
      .select("survey_id, position, question_type, question_text, required")
      .eq("id", questionId).maybeSingle();
    if (sourceError || !source || source.survey_id !== run.survey_id) {
      throw sourceError ?? new Error("Source question does not belong to original run");
    }
    const { data: target, error: targetError } = await supabase.from("pulse_questions")
      .select("id").eq("survey_id", survey.id).eq("position", source.position)
      .eq("question_type", source.question_type).maybeSingle();
    if (targetError) throw targetError; // Ambiguity is not a missing question.
    let targetQuestionId = target?.id;
    if (!targetQuestionId) {
      const { data: created, error } = await supabase.from("pulse_questions").insert({
        survey_id: survey.id, position: source.position, question_type: source.question_type,
        question_text: source.question_text, required: source.required,
      }).select("id").single();
      if (error || !created?.id) throw error ?? new Error("Destination question missing");
      targetQuestionId = created.id;
    }

    const [year, month, day] = mondayOfWeekSP(now).split("-").map(Number);
    const anchor = spWallClockToUTC(year, month, day).toISOString();
    const { data: existing, error: existingError } = await supabase.from("pulse_runs")
      .select("id").eq("survey_id", survey.id).eq("error_message", "RECLASSIFIED_WEEK")
      .eq("dispatched_at", anchor).maybeSingle();
    if (existingError) throw existingError;
    let targetRunId = existing?.id;
    if (!targetRunId) {
      const { data: created, error } = await supabase.from("pulse_runs").insert({
        survey_id: survey.id, status: "sent", dispatched_at: anchor,
        recipients_count: 0, responses_count: 0, error_message: "RECLASSIFIED_WEEK",
      }).select("id").single();
      if (error || !created?.id) throw error ?? new Error("Destination run missing");
      targetRunId = created.id;
    }
    if (!targetRunId || !targetQuestionId) return original;
    return { runId: targetRunId, questionId: targetQuestionId };
  } catch (error) {
    console.error("[resolveExpectedRun] preserving original run/question:", error);
    return original;
  }
}