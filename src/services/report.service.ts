import { Midia, Prisma, ReportStatus, UserType } from "@prisma/client";
import { reportRepository, ReportWithRelations } from "../repositories/report.repository";
import path from 'path';
import fs from 'fs'
import { AppError } from "../errors/app-error";
import { getMidiaExtension, UPLOAD_DIR } from "../middlewares/multer";

type AuthUser = { id: number, type: UserType }

type ReportFilters = {
    status?: ReportStatus;
    search?: string;
    dateFrom?: Date;
    dateTo?: Date;
}

// Status em que a ONG responsável ainda pode trabalhar na denúncia
const ACTIVE_STATUSES: ReportStatus[] = [ReportStatus.UNDER_REVIEW, ReportStatus.IN_PROGRESS];

async function register(input: Prisma.ReportCreateInput) {
    const report = await reportRepository.create({
        ...input,
    });

    return { report }

}

async function getPendingReports() {
    const reports = await reportRepository.findMany({
        status: ReportStatus.PENDING,
    });
    return { reports };
}

async function sendReportToReview(id: number, ngoUserId: number) {
    const report = await reportRepository.findById(id);
    if (!report) throw new AppError("REPORT_NOT_FOUND", 404);

    const updated = await reportRepository.editIfStatus(id, ReportStatus.PENDING, {
        status: ReportStatus.UNDER_REVIEW,
        ngoId: ngoUserId,
        rejectReason: null,
    });
    if (!updated) throw new AppError("REPORT_STATUS_NEED_BE_PENDING");
}

async function rejectReport(id: number, reason: string) {
    const report = await reportRepository.findById(id);
    if (!report) throw new AppError("REPORT_NOT_FOUND", 404);

    const updated = await reportRepository.editIfStatus(id, ReportStatus.PENDING, {
        status: ReportStatus.REJECTED,
        rejectReason: reason,
    });
    if (!updated) throw new AppError("REPORT_STATUS_NEED_BE_PENDING");
}

// Busca a denúncia garantindo que ela pertence à ONG e ainda está em triagem/andamento
async function findActiveNgoReport(id: number, ngoUserId: number) {
    const report = await reportRepository.findById(id);

    if (!report) throw new AppError("REPORT_NOT_FOUND", 404);
    if (report.ngoId !== ngoUserId) throw new AppError("FORBIDDEN", 403);
    if (!ACTIVE_STATUSES.includes(report.status))
        throw new AppError("REPORT_STATUS_NEED_BE_UNDER_REVIEW_OR_IN_PROGRESS");

    return report;
}

async function addNgoMidia(id: number, ngoUserId: number, files: Express.Multer.File[]) {
    const report = await findActiveNgoReport(id, ngoUserId);
    if (!files.length) throw new AppError("NO_FILES", 400);

    // Se algo falhar aqui, o error handler apaga os arquivos que o multer salvou
    return reportRepository.edit(report.id, {
        midia: {
            create: files.map((file) => ({
                type: "image",
                extension: getMidiaExtension(file.filename),
                url: `/images/${file.filename}`,
                addedByNgo: true,
            }))
        }
    });
}

async function updateStatus(id: number, ngoUserId: number, status: ReportStatus, statusComment: string) {
    const report = await findActiveNgoReport(id, ngoUserId);

    return reportRepository.edit(report.id, { status, statusComment });
}

async function findByUser(id: number, userType: UserType, filters: ReportFilters) {
    const where: Prisma.ReportWhereInput = userType == UserType.ONG
        ? { ngoId: id }
        : { userId: id };

    if (filters.status) {
        where.status = filters.status;
    }

    if (filters.search) {
        where.OR = [
            { description: { contains: filters.search, mode: 'insensitive' } },
            { location: { contains: filters.search, mode: 'insensitive' } }
        ];
    }

    if (filters.dateFrom || filters.dateTo) {
        where.createdAt = {
            ...(filters.dateFrom && { gte: filters.dateFrom }),
            ...(filters.dateTo && { lte: filters.dateTo }),
        };
    }

    const reports = await reportRepository.findMany(where);
    return { reports }
}

async function findById(id: number) {
    const report = await reportRepository.findById(id)
    if (!report) return null
    return report
}

// Quem pode ver uma denúncia: o denunciante, a ONG responsável
// ou qualquer ONG enquanto ela está na fila de triagem (PENDING)
function canView(report: ReportWithRelations, user: AuthUser) {
    if (user.type === UserType.ONG) {
        return report.ngoId === user.id || report.status === ReportStatus.PENDING;
    }
    return report.userId === user.id;
}

async function edit(id: number, data: Prisma.ReportUpdateInput) {
    const report = await reportRepository.edit(id, data)
    if (!report) return null
    return report
}


// Mídias da denúncia que o denunciante pode remover (as adicionadas pela ONG ficam)
async function findRemovableMidia(reportId: number, ids: number[]): Promise<Midia[]> {
    if (!ids.length) return []
    const midia = await reportRepository.findReportMidia(reportId)
    return midia.filter(item => ids.includes(item.id) && !item.addedByNgo)
}

function deleteMidiaFiles(midia: Midia[]) {
    midia.forEach(item => {
        // basename: mesmo que a url no banco esteja adulterada, nunca sai da pasta de uploads
        const midiaPath = path.join(UPLOAD_DIR, path.basename(item.url));
        try {
            if (fs.existsSync(midiaPath)) fs.unlinkSync(midiaPath);
        } catch (err) {
            console.error("Erro ao deletar arquivo:", midiaPath, err);
        }
    });
}

async function exclude(id: number) {
    const midia = await reportRepository.findReportMidia(id)

    // Primeiro o banco: se a exclusão falhar, os arquivos continuam no disco
    await reportRepository.deleteById(id)
    deleteMidiaFiles(midia)
}


export const reportServices = {
    register,
    getPendingReports,
    sendReportToReview,
    rejectReport,
    addNgoMidia,
    updateStatus,
    findByUser,
    findById,
    canView,
    edit,
    findRemovableMidia,
    deleteMidiaFiles,
    exclude
}
