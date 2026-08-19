export default function Card({
  titulo,
  valor,
  descricao
}: {
  titulo:string;
  valor:string;
  descricao:string;
}) {

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">

      <h2 className="text-slate-400 text-sm">
        {titulo}
      </h2>

      <p className="text-3xl font-bold mt-2">
        {valor}
      </p>

      <p className="text-slate-500 mt-2">
        {descricao}
      </p>

    </div>
  );
}
