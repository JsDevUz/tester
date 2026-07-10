import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { TestTaker } from "../components/test/TestTaker";

export function TakeTestPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const submissionId = searchParams.get("sid") ?? undefined;
  const isPractice = searchParams.get("practice") === "1";
  const practiceSuffix = isPractice ? "&practice=1" : "";

  return (
    <TestTaker
      slug={slug!}
      submissionId={submissionId}
      practiceMode={isPractice}
      onNavigateResult={(sid) =>
        navigate(`/t/${slug}/result?sid=${sid}${practiceSuffix}`, { replace: true })
      }
      onExit={() => navigate(`/t/${slug}`)}
    />
  );
}
