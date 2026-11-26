import { prisma } from "../src/config/prisma";
import { UserType, ReportStatus } from "@prisma/client";
import bcrypt from "bcrypt";

async function main() {
  // ATENÇÃO: o seed APAGA todos os dados do banco apontado por DATABASE_URL.
  // Use apenas no banco local de desenvolvimento.
  if (process.env.NODE_ENV === "production") {
    throw new Error("O seed não pode ser executado em produção");
  }

  // Limpar dados existentes
  await prisma.midia.deleteMany();
  await prisma.report.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.user.deleteMany();

  // Criar usuários
  const hashedPassword = await bcrypt.hash("123456", 10);
  
  const user = await prisma.user.create({
    data: {
      email: "usuario@exemplo.com",
      name: "João Silva",
      password: hashedPassword,
      phone: "(47) 99999-8888",
      cpf: "529.982.247-25",
      type: UserType.USER,
    },
  });

  const ong1 = await prisma.user.create({
    data: {
      email: "ong1@exemplo.com",
      name: "ONG Amigos dos Animais",
      password: hashedPassword,
      phone: "(47) 88888-7777",
      cnpj: "11.222.333/0001-81",
      type: UserType.ONG,
    },
  });

  const ong2 = await prisma.user.create({
    data: {
      email: "ong2@exemplo.com",
      name: "ONG Patas Felizes",
      password: hashedPassword,
      phone: "(47) 77777-6666",
      cnpj: "11.444.777/0001-61",
      type: UserType.ONG,
    },
  });

  // Criar denúncias
  const reports = await Promise.all([
    prisma.report.create({
      data: {
        description: "Cão abandonado na rua",
        details: "Encontrei um cão magro e assustado perto do parque. Ele parece estar perdido há vários dias.",
        // location é sempre "latitude, longitude"; o texto do endereço fica em address
        location: "-26.9187, -49.0661",
        address: "Rua das Flores, 123 - Centro",
        status: ReportStatus.PENDING,
        userId: user.id,
        ocurrenceDate: new Date("2025-10-14T10:00:00Z"),
        midia: {
          create: [
            {
              type: "image",
              extension: "jpg",
              url: "/images/report1.jpg",
            },
          ],
        },
      },
    }),
    prisma.report.create({
      data: {
        description: "Gato ferido",
        details: "Gato com uma das patas machucada, precisa de ajuda médica urgente.",
        location: "-26.9050, -49.0790",
        address: "Avenida Principal, 456 - Bairro Novo",
        status: ReportStatus.UNDER_REVIEW,
        userId: user.id,
        ngoId: ong1.id,
        ocurrenceDate: new Date("2025-10-13T15:30:00Z"),
        midia: {
          create: [
            {
              type: "image",
              extension: "jpg",
              url: "/images/report2.jpg",
            },
          ],
        },
      },
    }),
    prisma.report.create({
      data: {
        description: "Vários filhotes abandonados",
        details: "Encontrei uma caixa com 5 filhotes de cachorro recém-nascidos. A mãe não está por perto.",
        location: "-26.9195, -49.0655",
        address: "Praça Central - próximo ao coreto",
        status: ReportStatus.IN_PROGRESS,
        userId: user.id,
        ngoId: ong2.id,
        ocurrenceDate: new Date("2025-10-12T08:00:00Z"),
        midia: {
          create: [
            {
              type: "image",
              extension: "jpg",
              url: "/images/report3.jpg",
            },
            {
              type: "video",
              extension: "mp4",
              url: "/images/report3_video.mp4",
            },
          ],
        },
      },
    }),
    prisma.report.create({
      data: {
        description: "Animal em situação de maus-tratos",
        details: "Cão preso em corrente muito curta, sem água nem comida adequada.",
        location: "-26.8600, -49.1200",
        address: "Rua dos Animais, 789 - Zona Rural",
        status: ReportStatus.RESOLVED,
        userId: user.id,
        ngoId: ong1.id,
        ocurrenceDate: new Date("2025-10-10T14:20:00Z"),
        midia: {
          create: [
            {
              type: "image",
              extension: "jpg",
              url: "/images/report4.jpg",
            },
          ],
        },
      },
    }),
  ]);

  // Criar notificações
  await Promise.all([
    prisma.notification.create({
      data: {
        message: "Nova denúncia recebida em sua região",
        userId: ong1.id,
      },
    }),
    prisma.notification.create({
      data: {
        message: "Sua denúncia está em análise",
        userId: user.id,
      },
    }),
  ]);

  console.log("Seed criado com sucesso!");
  console.log(`Usuários: 3`);
  console.log(`Denúncias: ${reports.length}`);
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })