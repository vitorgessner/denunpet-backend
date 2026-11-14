import { Midia, Prisma, Report, ReportStatus } from "@prisma/client";
import { prisma } from '../config/prisma';

// Dados do usuário que podem sair na API. Nunca usar `user: true`/`ngo: true`:
// isso devolve o registro inteiro (hash da senha, CPF/CNPJ, e-mail, telefone).
const publicUser = { select: { id: true, name: true } } as const;

const reportInclude = {
    midia: true,
    user: publicUser,
    ngo: publicUser,
} satisfies Prisma.ReportInclude;


async function create(data: Prisma.ReportCreateInput): Promise<Report> {
    return prisma.report.create({ data });
}

async function findMany(where: Prisma.ReportWhereInput): Promise<Report[] | null> {
    return prisma.report.findMany({
        where,
        include: reportInclude
    })
}

async function findByUser(id: number): Promise<Report[] | null> {
    return prisma.report.findMany({
        where: { userId: id },
        include: reportInclude
    })
}

async function findById(id: number): Promise<Report | null> {
    return prisma.report.findUnique({
        where: { id: id },
        include: reportInclude
    })
}

async function edit(id: number, data: Prisma.ReportUpdateInput): Promise<Report> {
    return prisma.report.update({ where: { id }, data })
}

// Atualiza somente se a denúncia ainda estiver no status esperado (operação atômica).
// Evita que duas ONGs assumam/rejeitem a mesma denúncia ao mesmo tempo.
async function editIfStatus(id: number, status: ReportStatus, data: Prisma.ReportUncheckedUpdateManyInput): Promise<boolean> {
    const { count } = await prisma.report.updateMany({ where: { id, status }, data });
    return count > 0;
}

async function findReportMidia(id: number): Promise<Midia[]> {
    return prisma.midia.findMany({ where: { reportId: id } });
}

async function deleteById(id: number): Promise<Report | null> {
    return prisma.report.delete({ where: { id } });
}


export const reportRepository = {
    create,
    findMany,
    findByUser,
    findById,
    edit,
    editIfStatus,
    findReportMidia,
    deleteById
};
