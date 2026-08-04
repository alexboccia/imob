import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const senha = process.env.SEED_ADMIN_SENHA ?? "admin123";

  const senhaHash = await bcrypt.hash(senha, 10);

  const usuario = await prisma.usuario.upsert({
    where: { email },
    update: {},
    create: {
      nome: "Administrador",
      email,
      senhaHash,
      papel: "ADMINISTRADOR",
    },
  });

  console.log(`Usuário administrador pronto: ${usuario.email}`);

  const opcoesImovel = [
    "Acessível para PCD",
    "Água quente",
    "Andar alto",
    "Aquecimento a gás",
    "Aquecimento solar",
    "Ar-condicionado",
    "Ar-condicionado em todos os ambientes",
    "Ar-condicionado split",
    "Área de serviço",
    "Área externa",
    "Armário na cozinha",
    "Armário no quarto",
    "Armários embutidos",
    "Automação residencial",
    "Banheiro adaptado",
    "Banheiro de serviço",
    "Banheiro social",
    "Cabeamento estruturado",
    "Carregador para veículo elétrico",
    "Churrasqueira privativa",
    "Climatização",
    "Closet",
    "Cobertura",
    "Copa",
    "Cortinas/persianas automatizadas",
    "Cozinha americana",
    "Cozinha planejada",
    "Dependência de empregada",
    "Depósito",
    "Despensa",
    "Energia solar",
    "Escritório",
    "Espaço gourmet",
    "Esquina",
    "Face norte",
    "Fechadura eletrônica",
    "Garagem privativa",
    "Gás encanado",
    "Home office",
    "Iluminação planejada",
    "Internet cabeada",
    "Jacuzzi / Hidromassagem",
    "Jardim",
    "Lareira",
    "Lavabo",
    "Mezanino",
    "Mobiliado",
    "Móveis planejados",
    "Pergolado",
    "Piscina privativa",
    "Piso de madeira",
    "Piso frio",
    "Piso laminado",
    "Piso porcelanato",
    "Piso vinílico",
    "Porão",
    "Portas largas",
    "Quintal",
    "Rebaixamento em gesso",
    "Sacada",
    "Sala de estar",
    "Sala de jantar",
    "Sala de TV",
    "Sauna privativa",
    "Sol da manhã",
    "Sol da tarde",
    "Sotão",
    "Suíte",
    "Terraço",
    "Vaga coberta",
    "Vaga descoberta",
    "Vaga para visitante",
    "Varanda",
    "Ventilador de teto",
    "Vista livre",
    "Vista panorâmica",
    "Vista para lago",
    "Vista para montanha",
    "Vista para o mar",
    "Vista para praça",
    "Aceita pet",
    "Churrasqueira",
    "Elevador",
    "Lavanderia",
    "Piscina",
    "Portaria 24h",
    "Quadra poliesportiva",
    "Salão de festas",
    "Zelador",
  ];

  const opcoesCondominio = [
    "Academia",
    "Academia ao ar livre",
    "Aceita pet",
    "Berçário",
    "Bicicletário",
    "Bicicletário com oficina",
    "Brinquedoteca",
    "Câmeras de segurança",
    "Campo de futebol",
    "Car wash",
    "Carregador para carro elétrico",
    "Cerca elétrica",
    "Churrasqueira",
    "Coleta seletiva",
    "Condomínio fechado",
    "Controle de acesso",
    "Coworking",
    "Deck molhado",
    "Elevador",
    "Elevador de serviço",
    "Elevador social",
    "Energia solar",
    "Espaço delivery",
    "Espaço gourmet",
    "Espaço kids",
    "Espaço pet",
    "Espaço teen",
    "Espaço zen",
    "Fraldário",
    "Gerador",
    "Gerador para áreas comuns",
    "Interfone",
    "Lavanderia compartilhada",
    "Lockers inteligentes",
    "Mercado autônomo",
    "Mini mercado",
    "Oficina compartilhada",
    "Pet place",
    "Piscina",
    "Piscina aquecida",
    "Piscina coberta",
    "Piscina infantil",
    "Pista de caminhada",
    "Pista de cooper",
    "Playground",
    "Portão eletrônico",
    "Portaria 24h",
    "Quadra de areia",
    "Quadra de beach tennis",
    "Quadra de futebol de salão",
    "Quadra de tênis",
    "Quadra poliesportiva",
    "Reuso de água",
    "Ronda motorizada",
    "Sala de cinema",
    "Sala de jogos",
    "Salão de festas",
    "Sauna",
    "Segurança 24h",
    "Spa",
    "Vagas para visitantes",
  ];

  for (const nome of opcoesImovel) {
    await prisma.caracteristicaOpcao.upsert({
      where: { categoria_nome: { categoria: "IMOVEL", nome } },
      update: {},
      create: { categoria: "IMOVEL", nome },
    });
  }

  for (const nome of opcoesCondominio) {
    await prisma.caracteristicaOpcao.upsert({
      where: { categoria_nome: { categoria: "CONDOMINIO", nome } },
      update: {},
      create: { categoria: "CONDOMINIO", nome },
    });
  }

  console.log(
    `Catálogo de características pronto: ${opcoesImovel.length} do imóvel, ${opcoesCondominio.length} do condomínio.`
  );
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
