import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, PageShell } from "@algohub/ui";
import { products } from "@/registry";

export default function HomePage() {
  const ready = products.filter((p) => p.status === "MVP_READY" || p.status === "LIVE").length;
  return (
    <PageShell
      skipLinkLabel="Перейти к содержимому"
      header={<span className="text-lg font-semibold">AlgoHub</span>}
      footer={<span>AlgoHub · локальная сборка</span>}
    >
      <h1 className="text-3xl font-bold tracking-tight">AlgoHub</h1>
      <p className="mt-3 max-w-prose text-muted-foreground">
        Платформа из {products.length} небольших алгоритмических веб-продуктов: честные голосования, справедливые
        графики смен, встречи на полпути и другие задачи, которые решаются алгоритмом, а не спором.
      </p>
      <Card className="mt-8 max-w-prose">
        <CardHeader>
          <CardTitle>Каталог в разработке</CardTitle>
          <CardDescription>
            Каталог продуктов, поиск и страницы продуктов появятся в следующей фазе. Сейчас готово продуктов: {ready} из{" "}
            {products.length}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Badge variant="outline">Фаза 0 · каркас платформы</Badge>
        </CardContent>
      </Card>
    </PageShell>
  );
}
