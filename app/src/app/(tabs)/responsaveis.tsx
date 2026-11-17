import { Link } from 'expo-router';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { styles as page } from '@/components/connections/styles';
import { AccountOwners } from '@/components/people/AccountOwners';
import { People } from '@/components/people/People';
import { Loadable, signedInPage } from '@/components/states';
import { WIDE_MIN } from '@/lib/dashboard';
import { useAccounts, useFamily, useRefreshMoney } from '@/lib/queries';
import { styles } from '@/components/people/styles';

// Responsáveis (from the old app): the family's people and who owns each account.
export default signedInPage(Owners);

function Owners() {
  const wide = useWindowDimensions().width >= WIDE_MIN;
  const family = useFamily(true);
  const accounts = useAccounts(true);
  const refresh = useRefreshMoney();

  return (
    <ScrollView style={page.page} contentContainerStyle={wide ? page.wideContent : page.content}>
      <View style={page.column}>
        {wide ? null : (
          <Link href="/" style={page.back}>
            ‹ Início
          </Link>
        )}
        <Text style={[page.title, wide && page.wideTitle]}>Responsáveis</Text>
        <Text style={page.lead}>
          Quem é dono de cada conta, para saber quem gastou o quê. Todos da família veem tudo.
        </Text>
        <View style={styles.page}>
          <Loadable
            isError={family.isError || accounts.isError}
            loading={!family.data || !accounts.data}
            value={
              family.data && accounts.data ? { family: family.data, accounts: accounts.data } : null
            }
            empty=""
          >
            {(data) => (
              <>
                <People
                  members={data.family.members}
                  accounts={data.accounts}
                  onChanged={refresh}
                />
                <AccountOwners
                  accounts={data.accounts}
                  members={data.family.members}
                  narrow={!wide}
                  onChanged={refresh}
                />
              </>
            )}
          </Loadable>
        </View>
      </View>
    </ScrollView>
  );
}
