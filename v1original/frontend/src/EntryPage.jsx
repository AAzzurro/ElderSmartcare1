import { Card, PrimaryButton } from "./ui";
import { User, Users } from "lucide-react";

export default function EntryPage({ onElder, onNurse }) {
  return (
    <div className="px-6 py-10">
      <div className="text-center">
        <div className="text-4xl font-extrabold tracking-tight text-gray-900 leading-snug">
          智爱助老
        </div>
        <div className="text-2xl font-extrabold tracking-tight text-gray-900 leading-snug">
          智慧养老用药助手
        </div>
        <div className="mt-6 -mx-6">
          <img
            src="/entry-hero.png"
            alt="应用展示图"
            className="w-full h-auto max-h-64 object-contain"
          />
        </div>
        <div className="mt-4 text-lg text-gray-600 font-medium">
          请选择使用身份
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <PrimaryButton variant="submit" onClick={onElder}>
          <span className="inline-flex items-center justify-center gap-3">
            <User className="w-7 h-7 text-white" />
            <span>我是老人</span>
          </span>
        </PrimaryButton>
        <PrimaryButton variant="ghost" onClick={onNurse}>
          <span className="inline-flex items-center justify-center gap-3">
            <Users className="w-7 h-7" />
            <span>我是家属</span>
          </span>
        </PrimaryButton>
      </div>

      <div className="mt-10">
        <Card className="p-3 text-center">
          <div className="text-base font-bold text-gray-900">温馨提示</div>
          <div className="mt-1 text-xs text-gray-500 leading-snug">
            本应用仅用于辅助用药，不能替代医疗诊断，如有不适请及时就医。
          </div>
        </Card>
      </div>
    </div>
  );
}

