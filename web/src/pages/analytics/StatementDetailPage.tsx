import { Alert, Button } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { paths } from '../../config/paths';
import { StatementSheet } from './StatementSheet';
import styles from './StatementDetailPage.module.css';

export default function StatementDetailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const siteCode = searchParams.get('siteCode') ?? '';
  const partyCode = searchParams.get('partyCode') ?? '';
  const direction = searchParams.get('direction') === 'inbound' ? 'inbound' : 'outbound';
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  const materialCode = searchParams.get('materialCode') ?? undefined;

  const back = () => {
    const query = new URLSearchParams({ direction, from, to });
    if (siteCode) query.set('siteCode', siteCode);
    if (materialCode) query.set('materialCode', materialCode);
    navigate(`${paths.analyticsStatement}?${query.toString()}`);
  };

  if (!siteCode || !partyCode) {
    return (
      <>
        <PageHeader title="客户对账单" onBack={back} />
        <div className={styles.page}>
          <Alert
            type="error"
            showIcon
            message="缺少厂区或往来方参数，请从客户对账列表进入。"
            action={<Button onClick={back}>返回列表</Button>}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="客户对账单"
        description="按厂区与往来方核对有效过磅单重量。"
        onBack={back}
      />
      <div className={styles.page}>
        <StatementSheet
          siteCode={siteCode}
          partyCode={partyCode}
          direction={direction}
          from={from}
          to={to}
          materialCode={materialCode}
        />
      </div>
    </>
  );
}
