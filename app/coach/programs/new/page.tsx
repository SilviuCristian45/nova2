import { Text } from "@/app/components/language-provider";
import { requireCoach } from "@/lib/coach/auth";
import { Screen } from "@/app/components/ui";
import { ProgramBuilder } from "../program-builder";

export const dynamic = "force-dynamic";

export default async function NewCoachProgramPage() {
  await requireCoach();
  return (
    <Screen back="/coach/programs" title={<Text ro="Program nou" en="New program" />}>
      <ProgramBuilder initial={null} />
    </Screen>
  );
}
